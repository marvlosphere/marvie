export function breakoutRoomName(mainRoom: string, index: number) {
  return `${mainRoom}--breakout-${index}`;
}

export function parentRoomOf(roomName: string): string | null {
  const m = roomName.match(/^(.*)--breakout-\d+$/);
  return m ? m[1] : null;
}
