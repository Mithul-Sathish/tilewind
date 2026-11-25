/* Player names are made by the game, never typed: two plain words, the same pair for the same browser every time. */
const ADJ = ['Quiet','Bright','Jade','Amber','Swift','Calm','Lucky','Misty','Golden','Silver','Gentle','Brave','Kind','Clever','Sunny','Little','Rosy','Steady','Nimble','Patient','Cosy','Merry','Mellow','Noble','Lively','Rainy','Snowy','Windy','Polite','Tidy','Honest','Cheery'];
const NOUN = ['Crane','Heron','Panda','Tiger','Lotus','Pine','River','Lantern','Comet','Pebble','Maple','Otter','Sparrow','Koi','Willow','Cloud','Fox','Rabbit','Plum','Orchid','Teapot','Kite','Harbor','Meadow','Dumpling','Firefly','Badger','Turtle','Swallow','Peony','Acorn','Robin'];
export function nameFor(th){
  let h = 2166136261; for (const ch of String(th)){ h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } h >>>= 0;
  return ADJ[h % ADJ.length] + ' ' + NOUN[(h >>> 8) % NOUN.length];
}
export const BOT_NAMES = ['Computer: Easy', 'Computer: Steady', 'Computer: Bold'];
