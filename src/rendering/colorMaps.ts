function channelToHex(channel: number): string {
  const clamped = Math.max(0, Math.min(255, Math.round(channel)));

  return clamped.toString(16).padStart(2, '0');
}

export function mapSignedValueToDivergingColor(value: number, maxMagnitude: number): string {
  if (maxMagnitude <= 0) {
    return '#f4f1ec';
  }

  const normalized = Math.max(-1, Math.min(1, value / maxMagnitude));

  if (normalized === 0) {
    return '#f4f1ec';
  }

  const intensity = Math.abs(normalized);
  const neutral = 244 - intensity * 42;

  if (normalized >= 0) {
    const red = 159 + intensity * 63;
    const green = neutral - intensity * 96;
    const blue = neutral - intensity * 108;

    return `#${channelToHex(red)}${channelToHex(green)}${channelToHex(blue)}`;
  }

  const red = neutral - intensity * 96;
  const green = neutral - intensity * 70;
  const blue = 168 + intensity * 62;

  return `#${channelToHex(red)}${channelToHex(green)}${channelToHex(blue)}`;
}

export function mapDensityToSequentialColor(value: number, maxValue: number): string {
  if (maxValue <= 0) {
    return '#fff8f4';
  }

  const normalized = Math.max(0, Math.min(1, value / maxValue));
  const red = 255 - normalized * 32;
  const green = 248 - normalized * 171;
  const blue = 244 - normalized * 184;

  return `#${channelToHex(red)}${channelToHex(green)}${channelToHex(blue)}`;
}

export function hexToNumber(hexColor: string): number {
  return Number.parseInt(hexColor.slice(1), 16);
}
