import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Maximize2, Minus, Play, TerminalSquare, X } from 'lucide-react-native';
import { executeShizukuShell, getShizukuStatus, requestShizukuPermission } from '../services/shizukuShell';
import { useSettingsStore } from '../stores/settings';
import { useThemeColors } from '../theme/colors';

export function FloatingTerminal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useThemeColors();
  const screen = useWindowDimensions();
  const config = useSettingsStore((s) => s.nativeToolConfig);
  const [command, setCommand] = useState('');
  const [output, setOutput] = useState('YSClaude Shizuku Shell\n');
  const [busy, setBusy] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [frame, setFrame] = useState({ x: 18, y: 80, width: Math.min(420, screen.width - 36), height: Math.min(460, screen.height * .58) });
  const dragStart = useRef(frame);
  const resizeStart = useRef(frame);
  const drag = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { dragStart.current = frame; },
    onPanResponderMove: (_, g) => setFrame((f) => ({ ...f, x: Math.max(0, Math.min(screen.width - f.width, dragStart.current.x + g.dx)), y: Math.max(0, Math.min(screen.height - 60, dragStart.current.y + g.dy)) })),
  }), [frame, screen.height, screen.width]);
  const resize = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { resizeStart.current = frame; },
    onPanResponderMove: (_, g) => setFrame((f) => ({ ...f, width: Math.max(280, Math.min(screen.width - f.x, resizeStart.current.width + g.dx)), height: Math.max(220, Math.min(screen.height - f.y, resizeStart.current.height + g.dy)) })),
  }), [frame, screen.height, screen.width]);

  async function run() {
    const value = command.trim(); if (!value || busy) return;
    setCommand(''); setBusy(true); setOutput((v) => `${v}\n$ ${value}\n`);
    try {
      let status = await getShizukuStatus();
      if (!status.installed) throw new Error('Shizuku 未运行，请先启动 Shizuku');
      if (!status.permissionGranted) {
        if (!await requestShizukuPermission()) throw new Error('Shizuku 授权被拒绝');
        status = await getShizukuStatus();
      }
      const result = await executeShizukuShell(value, config.shellTimeoutMs || 30000, config.shellMaxOutputChars || 20000);
      const text = `${result.stdout || ''}${result.stderr ? `\n[stderr]\n${result.stderr}` : ''}\n[exit ${result.exitCode}${result.timedOut ? ', timeout' : ''}${result.truncated ? ', truncated' : ''}; uid ${status.uid}]\n`;
      setOutput((v) => v + text);
    } catch (e: any) { setOutput((v) => `${v}[error] ${e?.message || String(e)}\n`); }
    finally { setBusy(false); }
  }

  if (!visible) return null;
  return <Modal visible transparent animationType="fade" onRequestClose={onClose}>
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <View style={[styles.window, { left: frame.x, top: frame.y, width: minimized ? 190 : frame.width, height: minimized ? 48 : frame.height, borderColor: colors.inputBorder }]}>
        <View style={styles.titlebar} {...drag.panHandlers}>
          <TerminalSquare size={17} color="#9ee493"/><Text style={styles.title}>Shizuku Shell</Text>
          <Pressable style={styles.icon} onPress={() => setMinimized(!minimized)}>{minimized ? <Maximize2 size={17} color="#ddd"/> : <Minus size={17} color="#ddd"/>}</Pressable>
          <Pressable style={styles.icon} onPress={onClose}><X size={17} color="#ddd"/></Pressable>
        </View>
        {!minimized && <>
          <ScrollView style={styles.console} contentContainerStyle={styles.consoleContent}><Text selectable style={styles.output}>{output}</Text>{busy && <ActivityIndicator color="#9ee493"/>}</ScrollView>
          <View style={styles.inputRow}><Text style={styles.prompt}>$</Text><TextInput value={command} onChangeText={setCommand} onSubmitEditing={run} editable={!busy} autoCapitalize="none" autoCorrect={false} placeholder="输入命令" placeholderTextColor="#777" style={styles.input}/><Pressable onPress={run} disabled={busy} style={styles.run}><Play size={17} color="#111" fill="#111"/></Pressable></View>
          <View style={styles.resize} {...resize.panHandlers}/>
        </>}
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  window:{position:'absolute',backgroundColor:'#151515',borderWidth:1,borderRadius:12,overflow:'hidden',elevation:20,shadowColor:'#000',shadowOpacity:.35,shadowRadius:12},
  titlebar:{height:48,backgroundColor:'#252525',flexDirection:'row',alignItems:'center',paddingHorizontal:12,gap:8}, title:{color:'#eee',fontWeight:'600',flex:1},icon:{padding:6},
  console:{flex:1},consoleContent:{padding:12},output:{color:'#d7d7d7',fontFamily:'monospace',fontSize:13,lineHeight:19},
  inputRow:{height:48,borderTopWidth:1,borderTopColor:'#333',flexDirection:'row',alignItems:'center',paddingHorizontal:10},prompt:{color:'#9ee493',fontFamily:'monospace',fontSize:16},input:{flex:1,color:'#fff',fontFamily:'monospace',paddingHorizontal:8},run:{backgroundColor:'#9ee493',borderRadius:7,padding:8},
  resize:{position:'absolute',right:0,bottom:0,width:24,height:24,borderRightWidth:3,borderBottomWidth:3,borderColor:'#888'},
});
