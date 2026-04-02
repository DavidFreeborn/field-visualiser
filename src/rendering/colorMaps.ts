function clampChannel(channel: number): number {
  return Math.max(0, Math.min(255, Math.round(channel)));
}

function channelsToNumber(red: number, green: number, blue: number): number {
  return (clampChannel(red) << 16) | (clampChannel(green) << 8) | clampChannel(blue);
}

export function mapSignedValueToDivergingColor(value: number, maxMagnitude: number): string {
  const colorNumber = mapSignedValueToDivergingNumber(value, maxMagnitude);
  return `#${colorNumber.toString(16).padStart(6, '0')}`;
}

export function mapSignedValueToDivergingNumber(value: number, maxMagnitude: number): number {
  if (maxMagnitude <= 0) {
    return 0xf4f1ec;
  }

  const normalized = Math.max(-1, Math.min(1, value / maxMagnitude));

  if (normalized === 0) {
    return 0xf4f1ec;
  }

  const intensity = Math.abs(normalized);
  const neutral = 244 - intensity * 42;

  if (normalized >= 0) {
    const red = 159 + intensity * 63;
    const green = neutral - intensity * 96;
    const blue = neutral - intensity * 108;

    return channelsToNumber(red, green, blue);
  }

  const red = neutral - intensity * 96;
  const green = neutral - intensity * 70;
  const blue = 168 + intensity * 62;

  return channelsToNumber(red, green, blue);
}

export function mapDensityToSequentialColor(value: number, maxValue: number): string {
  const colorNumber = mapDensityToSequentialNumber(value, maxValue);
  return `#${colorNumber.toString(16).padStart(6, '0')}`;
}

export function mapDensityToSequentialNumber(value: number, maxValue: number): number {
  if (maxValue <= 0) {
    return 0xfff8f4;
  }

  const normalized = Math.max(0, Math.min(1, value / maxValue));
  const red = 255 - normalized * 32;
  const green = 248 - normalized * 171;
  const blue = 244 - normalized * 184;

  return channelsToNumber(red, green, blue);
}

export function hexToNumber(hexColor: string): number {
  return Number.parseInt(hexColor.slice(1), 16);
}
