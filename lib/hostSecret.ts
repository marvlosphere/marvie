import { parentRoomOf } from "@/lib/breakoutRooms";

/** Breakout rooms share their parent's host secret, so a host who created
 * the main room is automatically recognized as host in its breakouts too. */
export function hostSecretStorageKey(roomName: string) {
  const parent = parentRoomOf(roomName) ?? roomName;
  return `marvie:hostSecret:${parent}`;
}
