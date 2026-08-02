import { markPositions, checkExits } from '../modules/position/index.js';
import { gatewayBroadcast } from '../websocket/gateway.js';
import { User } from '../models/User.js';
import { PositionStatus } from '@trading-os/shared';
import { Position } from '../models/Position.js';

let timer: NodeJS.Timeout | undefined;

export function startPositionWorker() {
  if (timer) return;
  timer = setInterval(async () => {
    try {
      await markPositions();
      await checkExits();
      const users = await User.find().select('_id').lean();
      for (const u of users) {
        const positions = await Position.find({
          userId: u._id,
          status: PositionStatus.OPEN,
        }).lean();
        gatewayBroadcast(String(u._id), 'positions', positions);
      }
    } catch (e) {
      console.error('Position worker error', e);
    }
  }, 5_000);
}

export function stopPositionWorker() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
