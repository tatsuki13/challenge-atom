import assert from "node:assert/strict";
import test from "node:test";
import { parseGoogleHealthSample } from "../lib/googleHealthParsing.ts";

test("Google Health の日別歩数、主睡眠、安静時心拍を読み取る", () => {
  const result = parseGoogleHealthSample(
    { rollupDataPoints: [{ steps: { countSum: "3200" } }] },
    { dataPoints: [
      { sleep: { summary: { minutesAsleep: "30" }, metadata: { main: false } } },
      { sleep: { summary: { minutesAsleep: "420" }, metadata: { main: true } } },
    ] },
    { dataPoints: [{ dailyRestingHeartRate: { beatsPerMinute: "68" } }] },
  );
  assert.deepEqual(result, { steps: 3200, sleepMinutes: 420, restingHeartRate: 68 });
});

test("未取得項目や不正値を0とみなさない", () => {
  const result = parseGoogleHealthSample(
    {},
    { dataPoints: [{ sleep: { summary: {} } }] },
    { dataPoints: [{ dailyRestingHeartRate: { beatsPerMinute: "0" } }] },
  );
  assert.deepEqual(result, { steps: null, sleepMinutes: null, restingHeartRate: null });
});
