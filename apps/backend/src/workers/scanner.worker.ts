import { scannerService } from '../modules/scanner/index.js';

export function startScannerWorker() {
  scannerService.start();
}

export function stopScannerWorker() {
  scannerService.stop();
}
