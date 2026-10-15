// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`, SDK v0.14+, Gladys 5.1+).
//
// What a scene already does through the device features (start or stop the
// charge or the climate, set the charge limit or the climate temperature) is
// not repeated. The actions add what no feature offers:
//   - `refresh_vehicle` reads the car's state from the cloud now (without
//     waking the car) and gives it to the next actions of the scene;
//   - `lock_vehicle` locks the car (S-PIN of the configuration);
//   - `unlock_vehicle` unlocks it, only when "Allow unlocking" is on in the
//     configuration (off by default): never a switch a misclick can flip.
//
// Fields arrive resolved and validated by the core, without defaults (a
// manifest default is not applied to an action). Throwing fails this action
// only, the scene goes on.
// -----------------------------------------------------------------------------

import { pluggedOf, rangeOf } from './devices/vehicle.js';

export const SCENE_ACTION_KEYS = {
  REFRESH_VEHICLE: 'refresh_vehicle',
  LOCK_VEHICLE: 'lock_vehicle',
  UNLOCK_VEHICLE: 'unlock_vehicle',
};

const known = (value) => value !== undefined && value !== null;

export function createSceneActions(runtime) {
  return {
    async [SCENE_ACTION_KEYS.REFRESH_VEHICLE]({ fields }) {
      const snapshot = await runtime.refresh(fields.device);
      const outputs = {};
      if (Number.isFinite(snapshot.batteryLevel)) {
        outputs.battery_level = Math.round(snapshot.batteryLevel);
      }
      const range = rangeOf(snapshot);
      if (Number.isFinite(range)) outputs.range_km = Math.round(range);
      if (known(pluggedOf(snapshot))) outputs.plugged = pluggedOf(snapshot);
      if (known(snapshot.charging)) outputs.charging = snapshot.charging;
      if (known(snapshot.locked)) outputs.locked = snapshot.locked;
      return outputs;
    },

    async [SCENE_ACTION_KEYS.LOCK_VEHICLE]({ fields }) {
      await runtime.access(fields.device, 'lock');
    },

    async [SCENE_ACTION_KEYS.UNLOCK_VEHICLE]({ fields }) {
      await runtime.access(fields.device, 'unlock');
    },
  };
}
