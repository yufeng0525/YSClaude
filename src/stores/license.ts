import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { sqliteStorage } from '../db/kv-storage';

export interface LicenseGrant {
  inviteCode: string;
  deviceId: string;
  token?: string;
  activatedAt: number;
  verifiedAt: number;
}

interface LicenseState {
  _hydrated: boolean;
  grant: LicenseGrant | null;
  setGrant: (grant: LicenseGrant) => void;
  updateVerifiedAt: (verifiedAt: number, patch?: Partial<LicenseGrant>) => void;
  clearGrant: () => void;
}

export const useLicenseStore = create<LicenseState>()(
  persist(
    (set, get) => ({
      _hydrated: false,
      grant: null,
      setGrant: (grant) => set({ grant }),
      updateVerifiedAt: (verifiedAt, patch) =>
        set({
          grant: get().grant ? { ...get().grant!, ...patch, verifiedAt } : null,
        }),
      clearGrant: () => set({ grant: null }),
    }),
    {
      name: 'ysclaude-license',
      storage: createJSONStorage(() => sqliteStorage),
      partialize: (state) => ({
        grant: state.grant,
      }),
      onRehydrateStorage: () => () => {
        useLicenseStore.setState({ _hydrated: true });
      },
    }
  )
);
