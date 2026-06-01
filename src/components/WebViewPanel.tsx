import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';
import { colors } from '../theme/colors';
import {
  registerWebViewHost,
  WebViewObservation,
  WebViewTapResult,
} from '../services/webviewController';

type PendingRequest = {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  timeout: ReturnType<typeof setTimeout>;
};

const REQUEST_TIMEOUT_MS = 12000;
const OPEN_TIMEOUT_MS = 20000;
const MAX_OBSERVE_TEXT = 12000;
const MAX_ELEMENTS = 40;
const PANEL_MARGIN = 12;
const DEFAULT_PANEL_HEIGHT = 420;
const DEFAULT_PANEL_WIDTH = Dimensions.get('window').width - PANEL_MARGIN * 2;
const MIN_PANEL_WIDTH = 260;
const MIN_PANEL_HEIGHT = 280;

function buildClickScript(target: { index?: number; selector?: string }): string {
  const targetJson = JSON.stringify(target);
  return `
    (function () {
      var id = __REQUEST_ID__;
      var target = ${targetJson};
      var baseSelector = 'button,a,input,textarea,select,[role="button"],[onclick],canvas';
      var el = null;
      if (typeof target.index === 'number') {
        el = Array.prototype.slice.call(document.querySelectorAll(baseSelector), 0, ${MAX_ELEMENTS})[target.index] || null;
      } else if (target.selector) {
        try {
          el = document.querySelector(target.selector);
        } catch (e) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            source: 'ysclaude-webview',
            id: id,
            ok: false,
            error: '选择器格式不正确: ' + e.message
          }));
          return true;
        }
      }
      if (!el) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          source: 'ysclaude-webview',
          id: id,
          ok: false,
          error: '未找到要点击的元素'
        }));
        return true;
      }
      function textOf(node) {
        return ((node.innerText || node.textContent || node.getAttribute('aria-label') || node.title || '') + '')
          .replace(/\\s+/g, ' ')
          .trim()
          .slice(0, 120);
      }
      function cssEscape(value) {
        if (window.CSS && window.CSS.escape) return window.CSS.escape(value);
        return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\\\$&');
      }
      function selectorOf(node) {
        if (node.id) return '#' + cssEscape(node.id);
        var parts = [];
        var current = node;
        while (current && current.nodeType === 1 && current !== document.body && parts.length < 5) {
          var tag = (current.tagName || '').toLowerCase();
          if (!tag) break;
          var part = tag;
          var parent = current.parentElement;
          if (parent) {
            var siblings = Array.prototype.filter.call(parent.children, function (child) {
              return child.tagName === current.tagName;
            });
            if (siblings.length > 1) {
              part += ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')';
            }
          }
          parts.unshift(part);
          current = parent;
        }
        return parts.join(' > ');
      }
      try {
        el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
      } catch (e) {
        try { el.scrollIntoView(true); } catch (err) {}
      }
      setTimeout(function () {
        var rect = el.getBoundingClientRect();
        var x = Math.round(rect.left + rect.width / 2);
        var y = Math.round(rect.top + rect.height / 2);
        var opts = {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: x,
          clientY: y,
          screenX: x,
          screenY: y
        };
        try { el.focus && el.focus(); } catch (e) {}
        try {
          if (window.TouchEvent) {
            var touch = new Touch({
              identifier: Date.now(),
              target: el,
              clientX: x,
              clientY: y,
              screenX: x,
              screenY: y,
              pageX: x + window.scrollX,
              pageY: y + window.scrollY
            });
            el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [touch], targetTouches: [touch], changedTouches: [touch] }));
            el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [touch] }));
          }
        } catch (e) {}
        try {
          if (window.PointerEvent) {
            el.dispatchEvent(new PointerEvent('pointerdown', opts));
            el.dispatchEvent(new PointerEvent('pointerup', opts));
          }
        } catch (e) {}
        try {
          el.dispatchEvent(new MouseEvent('mousedown', opts));
          el.dispatchEvent(new MouseEvent('mouseup', opts));
          el.dispatchEvent(new MouseEvent('click', opts));
        } catch (e) {}
        try { el.click && el.click(); } catch (e) {}
        window.ReactNativeWebView.postMessage(JSON.stringify({
          source: 'ysclaude-webview',
          id: id,
          ok: true,
          data: {
            x: x,
            y: y,
            target: (el.tagName || '').toLowerCase(),
            text: textOf(el),
            selector: selectorOf(el)
          }
        }));
      }, 80);
    })();
    true;
  `;
}

export function WebViewPanel() {
  const webViewRef = useRef<WebView>(null);
  const pendingRequests = useRef<Record<string, PendingRequest>>({});
  const pendingOpen = useRef<PendingRequest | null>(null);
  const urlRef = useRef('');
  const titleRef = useRef('');
  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [panelSize, setPanelSize] = useState({
    width: DEFAULT_PANEL_WIDTH,
    height: DEFAULT_PANEL_HEIGHT,
  });
  const [panelPosition, setPanelPosition] = useState(() => {
    const { height } = Dimensions.get('window');
    return { x: PANEL_MARGIN, y: Math.max(PANEL_MARGIN, height - DEFAULT_PANEL_HEIGHT - 92) };
  });
  const dragStart = useRef(panelPosition);
  const resizeStart = useRef(panelSize);

  const clampPanelSize = useCallback((width: number, height: number, x = panelPosition.x, y = panelPosition.y) => {
    const screen = Dimensions.get('window');
    return {
      width: Math.min(Math.max(MIN_PANEL_WIDTH, width), Math.max(MIN_PANEL_WIDTH, screen.width - x - PANEL_MARGIN)),
      height: Math.min(Math.max(MIN_PANEL_HEIGHT, height), Math.max(MIN_PANEL_HEIGHT, screen.height - y - PANEL_MARGIN)),
    };
  }, [panelPosition.x, panelPosition.y]);

  const clampPanelPosition = useCallback((x: number, y: number, size = panelSize) => {
    const { width, height } = Dimensions.get('window');
    return {
      x: Math.min(Math.max(PANEL_MARGIN, x), Math.max(PANEL_MARGIN, width - size.width - PANEL_MARGIN)),
      y: Math.min(Math.max(PANEL_MARGIN, y), Math.max(PANEL_MARGIN, height - size.height - PANEL_MARGIN)),
    };
  }, [panelSize]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dx) > 3 || Math.abs(gestureState.dy) > 3,
      onPanResponderGrant: () => {
        dragStart.current = panelPosition;
      },
      onPanResponderMove: (_, gestureState) => {
        setPanelPosition(
          clampPanelPosition(
            dragStart.current.x + gestureState.dx,
            dragStart.current.y + gestureState.dy
          )
        );
      },
      onPanResponderRelease: (_, gestureState) => {
        setPanelPosition(
          clampPanelPosition(
            dragStart.current.x + gestureState.dx,
            dragStart.current.y + gestureState.dy
          )
        );
      },
    })
  ).current;

  const resizeResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dx) > 3 || Math.abs(gestureState.dy) > 3,
      onPanResponderGrant: () => {
        resizeStart.current = panelSize;
      },
      onPanResponderMove: (_, gestureState) => {
        setPanelSize(
          clampPanelSize(
            resizeStart.current.width + gestureState.dx,
            resizeStart.current.height + gestureState.dy
          )
        );
      },
      onPanResponderRelease: (_, gestureState) => {
        setPanelSize(
          clampPanelSize(
            resizeStart.current.width + gestureState.dx,
            resizeStart.current.height + gestureState.dy
          )
        );
      },
    })
  ).current;

  const rejectPendingRequest = useCallback((id: string, reason: string) => {
    const pending = pendingRequests.current[id];
    if (!pending) return;
    clearTimeout(pending.timeout);
    delete pendingRequests.current[id];
    pending.reject(new Error(reason));
  }, []);

  const runScriptRequest = useCallback(
    <T,>(script: string): Promise<T> => {
      if (!visible || !urlRef.current) {
        return Promise.reject(new Error('尚未打开网页'));
      }

      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const wrappedScript = script.replace(/__REQUEST_ID__/g, JSON.stringify(id));
      return new Promise<T>((resolve, reject) => {
        pendingRequests.current[id] = {
          resolve,
          reject,
          timeout: setTimeout(() => rejectPendingRequest(id, '网页操作超时'), REQUEST_TIMEOUT_MS),
        };
        webViewRef.current?.injectJavaScript(wrappedScript);
      });
    },
    [rejectPendingRequest, visible]
  );

  const observe = useCallback(async (): Promise<WebViewObservation> => {
    setStatus('观察网页');
    return await runScriptRequest<WebViewObservation>(`
      (function () {
        var id = __REQUEST_ID__;
        function textOf(el) {
          return ((el.innerText || el.textContent || el.getAttribute('aria-label') || el.title || '') + '')
            .replace(/\\s+/g, ' ')
            .trim();
        }
        function cssEscape(value) {
          if (window.CSS && window.CSS.escape) return window.CSS.escape(value);
          return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\\\$&');
        }
        function selectorOf(el) {
          if (el.id) return '#' + cssEscape(el.id);
          var parts = [];
          var current = el;
          while (current && current.nodeType === 1 && current !== document.body && parts.length < 5) {
            var tag = (current.tagName || '').toLowerCase();
            if (!tag) break;
            var part = tag;
            var parent = current.parentElement;
            if (parent) {
              var siblings = Array.prototype.filter.call(parent.children, function (child) {
                return child.tagName === current.tagName;
              });
              if (siblings.length > 1) {
                part += ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')';
              }
            }
            parts.unshift(part);
            current = parent;
          }
          return parts.join(' > ');
        }
        var selectors = 'button,a,input,textarea,select,[role="button"],[onclick],canvas';
        var nodes = Array.prototype.slice.call(document.querySelectorAll(selectors), 0, ${MAX_ELEMENTS});
        var elements = nodes.map(function (el, index) {
          var rect = el.getBoundingClientRect();
          return {
            index: index,
            tag: (el.tagName || '').toLowerCase(),
            text: textOf(el).slice(0, 120),
            role: el.getAttribute('role') || '',
            selector: selectorOf(el),
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          };
        }).filter(function (el) {
          return el.width > 0 && el.height > 0;
        });
        window.ReactNativeWebView.postMessage(JSON.stringify({
          source: 'ysclaude-webview',
          id: id,
          ok: true,
          data: {
            title: document.title || '',
            url: location.href,
            text: ((document.body && document.body.innerText) || '').slice(0, ${MAX_OBSERVE_TEXT}),
            viewport: {
              width: Math.round(window.innerWidth || 0),
              height: Math.round(window.innerHeight || 0)
            },
            elements: elements
          }
        }));
      })();
      true;
    `);
  }, [runScriptRequest]);

  const tap = useCallback(
    async (x: number, y: number): Promise<WebViewTapResult> => {
      setStatus(`点击 ${Math.round(x)}, ${Math.round(y)}`);
      return await runScriptRequest<WebViewTapResult>(`
        (function () {
          var id = __REQUEST_ID__;
          var x = ${JSON.stringify(x)};
          var y = ${JSON.stringify(y)};
          var el = document.elementFromPoint(x, y);
          if (!el) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              source: 'ysclaude-webview',
              id: id,
              ok: false,
              error: '坐标位置没有可点击元素'
            }));
            return true;
          }
          var opts = {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: x,
            clientY: y,
            screenX: x,
            screenY: y
          };
          try { el.focus && el.focus(); } catch (e) {}
          try {
            if (window.PointerEvent) {
              el.dispatchEvent(new PointerEvent('pointerdown', opts));
              el.dispatchEvent(new PointerEvent('pointerup', opts));
            }
          } catch (e) {}
          try {
            el.dispatchEvent(new MouseEvent('mousedown', opts));
            el.dispatchEvent(new MouseEvent('mouseup', opts));
            el.dispatchEvent(new MouseEvent('click', opts));
          } catch (e) {}
          try { el.click && el.click(); } catch (e) {}
          window.ReactNativeWebView.postMessage(JSON.stringify({
            source: 'ysclaude-webview',
            id: id,
            ok: true,
            data: {
              x: x,
              y: y,
              target: (el.tagName || '').toLowerCase(),
              text: ((el.innerText || el.textContent || el.getAttribute('aria-label') || el.title || '') + '')
                .replace(/\\s+/g, ' ')
                .trim()
                .slice(0, 120)
            }
          }));
        })();
        true;
      `);
    },
    [runScriptRequest]
  );

  const clickElement = useCallback(
    async (index: number): Promise<WebViewTapResult> => {
      setStatus(`点击元素 ${index}`);
      return await runScriptRequest<WebViewTapResult>(buildClickScript({ index }));
    },
    [runScriptRequest]
  );

  const clickSelector = useCallback(
    async (selector: string): Promise<WebViewTapResult> => {
      setStatus(`点击选择器 ${selector}`);
      return await runScriptRequest<WebViewTapResult>(buildClickScript({ selector }));
    },
    [runScriptRequest]
  );

  const wait = useCallback(
    async (ms: number): Promise<WebViewObservation> => {
      const safeMs = Math.min(Math.max(Math.floor(ms), 200), 10000);
      setStatus(`等待 ${safeMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, safeMs));
      return await observe();
    },
    [observe]
  );

  const open = useCallback(async (nextUrl: string): Promise<WebViewObservation> => {
    if (visible && urlRef.current === nextUrl) {
      setStatus('网页已打开，继续观察');
      return await observe();
    }

    setVisible(true);
    setLoading(true);
    setStatus('打开网页');
    setTitle('');
    titleRef.current = '';
    urlRef.current = nextUrl;
    setUrl(nextUrl);

    return await new Promise<WebViewObservation>((resolve, reject) => {
      if (pendingOpen.current) {
        clearTimeout(pendingOpen.current.timeout);
        pendingOpen.current.reject(new Error('新的网页打开请求已开始'));
      }
      pendingOpen.current = {
        resolve,
        reject,
        timeout: setTimeout(() => {
          pendingOpen.current = null;
          setLoading(false);
          reject(new Error('网页加载超时'));
        }, OPEN_TIMEOUT_MS),
      };
    });
  }, [observe, visible]);

  useEffect(() => {
    return registerWebViewHost({ open, observe, tap, clickElement, clickSelector, wait });
  }, [clickElement, clickSelector, observe, open, tap, wait]);

  useEffect(() => {
    urlRef.current = url;
  }, [url]);

  const handleLoadEnd = async () => {
    setLoading(false);
    setStatus('网页已打开');
    if (pendingOpen.current) {
      const pending = pendingOpen.current;
      pendingOpen.current = null;
      clearTimeout(pending.timeout);
      try {
        const observation = await observe();
        pending.resolve(observation);
      } catch (err) {
        pending.reject(err);
      }
    }
  };

  const handleNavigationStateChange = (navState: any) => {
    const nextTitle = navState.title || '';
    const nextUrl = navState.url || urlRef.current;
    titleRef.current = nextTitle;
    urlRef.current = nextUrl;
    setTitle(nextTitle);
    setUrl(nextUrl);
  };

  const handleMessage = (event: WebViewMessageEvent) => {
    let payload: any;
    try {
      payload = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (payload?.source !== 'ysclaude-webview' || !payload.id) return;

    const pending = pendingRequests.current[payload.id];
    if (!pending) return;
    clearTimeout(pending.timeout);
    delete pendingRequests.current[payload.id];

    if (payload.ok) {
      if (payload.data?.title !== undefined) {
        titleRef.current = payload.data.title;
        setTitle(payload.data.title);
      }
      if (payload.data?.url) {
        urlRef.current = payload.data.url;
        setUrl(payload.data.url);
      }
      pending.resolve(payload.data);
    } else {
      pending.reject(new Error(payload.error || '网页操作失败'));
    }
  };

  if (!visible) return null;

  return (
    <View style={[styles.panel, { left: panelPosition.x, top: panelPosition.y, width: panelSize.width, height: panelSize.height }]}>
      <View style={styles.header} {...panResponder.panHandlers}>
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={1}>
            {title || '网页交互'}
          </Text>
          <Text style={styles.url} numberOfLines={1}>
            {url}
          </Text>
        </View>
        {loading && <ActivityIndicator size="small" color={colors.primary} />}
        <Pressable style={styles.closeButton} onPress={() => setVisible(false)}>
          <Text style={styles.closeText}>关闭</Text>
        </Pressable>
      </View>
      <WebView
        ref={webViewRef}
        source={{ uri: url }}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        onLoadEnd={handleLoadEnd}
        onMessage={handleMessage}
        onNavigationStateChange={handleNavigationStateChange}
        setSupportMultipleWindows={false}
      />
      <View style={styles.footer}>
        <Text style={styles.footerText} numberOfLines={1}>
          {status || '就绪'}
        </Text>
        <View style={styles.resizeHandle} {...resizeResponder.panHandlers}>
          <Text style={styles.resizeHandleText}>⌟</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  header: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerText: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  url: {
    marginTop: 2,
    color: colors.textTertiary,
    fontSize: 11,
  },
  closeButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  closeText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  webview: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  footer: {
    height: 28,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerText: {
    flex: 1,
    color: colors.textTertiary,
    fontSize: 11,
  },
  resizeHandle: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -10,
  },
  resizeHandleText: {
    color: colors.textTertiary,
    fontSize: 18,
    lineHeight: 20,
  },
});
