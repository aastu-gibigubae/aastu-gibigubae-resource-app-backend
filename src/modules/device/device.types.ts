import type { DeviceStatus } from '@prisma/client';

// Internal-facing shape — used within device.service and by other
// modules' cross-module calls (isDeviceValid returns a plain boolean,
// not this type, but activateFromLastLogin's internals work with this
// shape). The actual HTTP response shapes for this module's two
// endpoints are small enough (revoke-device, heartbeat) to build
// directly in the controller rather than needing a shared type here.
export interface PublicDeviceRecord {
  id: number;
  deviceFingerprint: string;
  status: DeviceStatus;
  activatedAt: Date;
  revokedAt: Date | null;
}
