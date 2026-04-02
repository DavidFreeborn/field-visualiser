import { mapSignedValueToDivergingColor } from '../../rendering/colorMaps';

describe('mapSignedValueToDivergingColor', () => {
  it('is symmetric about zero in channel ordering', () => {
    const positive = mapSignedValueToDivergingColor(1, 2);
    const negative = mapSignedValueToDivergingColor(-1, 2);

    expect(positive).not.toEqual(negative);
    expect(mapSignedValueToDivergingColor(0, 2)).toEqual('#f4f1ec');
  });
});
