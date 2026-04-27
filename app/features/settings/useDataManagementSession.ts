import { useDataBackup, type UseDataBackupReturn } from '@/composables/useDataBackup';
import { useEftLogsImport, type UseEftLogsImportReturn } from '@/composables/useEftLogsImport';
import {
  useTarkovDevImport,
  type UseTarkovDevImportReturn,
} from '@/composables/useTarkovDevImport';
export interface DataManagementSession {
  backup: UseDataBackupReturn;
  eftLogs: UseEftLogsImportReturn;
  tarkovDev: UseTarkovDevImportReturn;
}
export function useDataManagementSession(): DataManagementSession {
  return {
    backup: useDataBackup(),
    eftLogs: useEftLogsImport(),
    tarkovDev: useTarkovDevImport(),
  };
}
