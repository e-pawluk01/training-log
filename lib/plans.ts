// Each person's training cycle. Days run in order and loop; a day only moves on
// when its workout is finished, or (for a rest day) when that calendar day passes.
//
//   m      the movements. Two movements = a pair: per set, A for x reps then B for y reps.
//   nowt   no weight: true for the whole exercise, or one flag per movement in a pair.
//   unit   'time' = rounds logged as m:ss instead of reps.
//   sets   starting number of set boxes (default 3).
//   timed  a countdown bar in seconds (Sauna, Stretch).

export type Lift = { m: string[]; nowt?: boolean | boolean[]; unit?: "time"; sets?: number };
export type Timed = { n: string; timed: number };
export type Item = Lift | Timed;
export type Day = { t: string; x?: Item[]; rest?: boolean };
export type Plan = Day[];

export const isTimed = (it: Item): it is Timed => "timed" in it;
export const noWt = (it: Lift, k: number) => (Array.isArray(it.nowt) ? !!it.nowt[k] : !!it.nowt);

const STRETCH: Timed = { n: "Stretch", timed: 600 };

const ERYK: Plan = [
  { t: "Bar Day", x: [{ m: ["Muscle-ups"] }, { m: ["Dips", "Pull-ups"] }, { m: ["Toes to bar"], nowt: true }, STRETCH] },
  { t: "Leg Day 1", x: [{ m: ["Squats"] }, { m: ["Nordic curls", "Sissy squats"], nowt: [true, false] }, { m: ["Leg raises"], nowt: true }, STRETCH] },
  { t: "Rest", rest: true },
  { t: "Ring Day", x: [{ m: ["Muscle-ups"] }, { m: ["Dips", "Pull-ups"] }, { m: ["Dragon flag"], nowt: true }, STRETCH] },
  { t: "Leg Day 2", x: [{ m: ["Pistol squats"] }, { m: ["Dragon squats"], nowt: true }, { m: ["SLDL", "Cossack squats"] }, STRETCH] },
  { t: "BW Day", x: [{ m: ["Pull-ups", "Dips"], nowt: true }, { m: ["Ab machine"] }, STRETCH] },
  { t: "Recovery & Cardio", x: [{ m: ["Assault bike", "Rowing"], unit: "time", nowt: true, sets: 3 }, { n: "Sauna", timed: 1800 }, STRETCH] },
  { t: "Rest", rest: true },
];

// People who can sign in. Their email and Google Sheet ID live in env vars
// (<KEY>_EMAIL, <KEY>_SHEET_ID) so they stay out of this public repo.
// A person with no plan (or no sheet) sees a "not set up yet" screen.
export const PEOPLE = {
  eryk: { name: "Eryk", plan: ERYK as Plan | null },
  alex: { name: "Alex", plan: null as Plan | null },
};
export type PersonKey = keyof typeof PEOPLE;
export const PERSON_KEYS = Object.keys(PEOPLE) as PersonKey[];
