/* Helpers for the /log page computations. Sign convention:
   +offsetUpCm means impact high => correction is negative (dial down).
   +offsetRightCm means impact right => correction is negative (dial left).
*/

export function milCorrection(rangeM: number, offsetUpCm: number, offsetRightCm: number) {
  if (!(rangeM > 0)) throw new Error("rangeM must be > 0");
  const up = (-offsetUpCm * 10) / rangeM;
  const right = (-offsetRightCm * 10) / rangeM;
  return { up, right };
}

export function moaCorrection(rangeM: number, offsetUpCm: number, offsetRightCm: number) {
  if (!(rangeM > 0)) throw new Error("rangeM must be > 0");
  const up = (-offsetUpCm * 34.38) / rangeM;
  const right = (-offsetRightCm * 34.38) / rangeM;
  return { up, right };
}