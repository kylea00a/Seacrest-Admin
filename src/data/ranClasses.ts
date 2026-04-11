/**
 * Ran GS Infinity – 9 classes (Swordsman to Shaper) and skills.
 * Sourced from Ran Online official/wiki/community; Extreme/Scientist/Assassin/Magician/Shaper filled from class descriptions.
 */

export type SkillTree = "INT" | "DEX" | "POW" | "ETC";

export interface Skill {
  id: string;
  name: string;
  tree: SkillTree;
  levelReq: number;
  spCost: number;
}

export interface RanClass {
  id: string;
  name: string;
  description: string;
  weapons: string;
  skills: Skill[];
}

export const RAN_CLASSES: RanClass[] = [
  {
    id: "swordsman",
    name: "Swordsman",
    description: "Close/Mid range – Swords / Blades",
    weapons: "Swords, Blades",
    skills: [
      { id: "sw_int_1", name: "Divine Shield", tree: "INT", levelReq: 7, spCost: 1 },
      { id: "sw_int_2", name: "Rounin Slash", tree: "INT", levelReq: 7, spCost: 2 },
      { id: "sw_int_3", name: "Shogun Swing", tree: "INT", levelReq: 27, spCost: 3 },
      { id: "sw_int_4", name: "Cyclone Slash", tree: "INT", levelReq: 47, spCost: 5 },
      { id: "sw_int_5", name: "Tranquility", tree: "INT", levelReq: 57, spCost: 6 },
      { id: "sw_int_6", name: "Arcane Punch", tree: "INT", levelReq: 67, spCost: 7 },
      { id: "sw_int_7", name: "Kamikaze", tree: "INT", levelReq: 87, spCost: 9 },
      { id: "sw_int_8", name: "Metalbody", tree: "INT", levelReq: 97, spCost: 11 },
      { id: "sw_int_9", name: "Lightning Strike", tree: "INT", levelReq: 107, spCost: 12 },
      { id: "sw_int_10", name: "Cresent Slash", tree: "INT", levelReq: 117, spCost: 13 },
      { id: "sw_int_11", name: "Blood Rain", tree: "INT", levelReq: 127, spCost: 13 },
      { id: "sw_int_12", name: "Sword Rings", tree: "INT", levelReq: 147, spCost: 15 },
      { id: "sw_int_13", name: "Rising Edge", tree: "INT", levelReq: 157, spCost: 15 },
      { id: "sw_dex_1", name: "Sword Stab", tree: "DEX", levelReq: 7, spCost: 1 },
      { id: "sw_dex_2", name: "Multi Slash", tree: "DEX", levelReq: 27, spCost: 3 },
      { id: "sw_dex_3", name: "Corkscrew Blade", tree: "DEX", levelReq: 47, spCost: 1 },
      { id: "sw_dex_4", name: "Lightning Slash", tree: "DEX", levelReq: 67, spCost: 7 },
      { id: "sw_dex_5", name: "Sword Explosion", tree: "DEX", levelReq: 87, spCost: 9 },
      { id: "sw_dex_6", name: "Sunken Strike", tree: "DEX", levelReq: 97, spCost: 10 },
      { id: "sw_dex_7", name: "Thunder Strike", tree: "DEX", levelReq: 117, spCost: 13 },
      { id: "sw_dex_8", name: "Inferno Attack", tree: "DEX", levelReq: 127, spCost: 14 },
      { id: "sw_pow_1", name: "X Strike", tree: "POW", levelReq: 7, spCost: 1 },
      { id: "sw_pow_2", name: "Dual Slash", tree: "POW", levelReq: 27, spCost: 3 },
      { id: "sw_pow_3", name: "Kick Slash", tree: "POW", levelReq: 47, spCost: 5 },
      { id: "sw_pow_4", name: "Hurricane Slash", tree: "POW", levelReq: 97, spCost: 11 },
      { id: "sw_pow_5", name: "Vacuum Slash", tree: "POW", levelReq: 117, spCost: 13 },
      { id: "sw_pow_6", name: "Tornado Slash", tree: "POW", levelReq: 127, spCost: 14 },
    ],
  },
  {
    id: "archer",
    name: "Archer",
    description: "Long range – Short Bows / Long Bows",
    weapons: "Bows",
    skills: [
      { id: "ar_int_1", name: "Shockwave", tree: "INT", levelReq: 1, spCost: 0 },
      { id: "ar_int_2", name: "Energy Arrow", tree: "INT", levelReq: 27, spCost: 3 },
      { id: "ar_int_3", name: "Vampiric Arrow", tree: "INT", levelReq: 47, spCost: 5 },
      { id: "ar_int_4", name: "Burst Fire", tree: "INT", levelReq: 67, spCost: 7 },
      { id: "ar_int_5", name: "Soul Arrow", tree: "INT", levelReq: 77, spCost: 9 },
      { id: "ar_int_6", name: "Heavens Judgement", tree: "INT", levelReq: 127, spCost: 14 },
      { id: "ar_dex_1", name: "Arrow Assault", tree: "DEX", levelReq: 7, spCost: 1 },
      { id: "ar_dex_2", name: "Arrow Storm", tree: "DEX", levelReq: 47, spCost: 5 },
      { id: "ar_dex_3", name: "Arrow of Armaggedon", tree: "DEX", levelReq: 87, spCost: 9 },
      { id: "ar_dex_4", name: "Star Fall", tree: "DEX", levelReq: 107, spCost: 12 },
      { id: "ar_dex_5", name: "Dance of Death", tree: "DEX", levelReq: 127, spCost: 14 },
      { id: "ar_pow_1", name: "Force Shot", tree: "POW", levelReq: 7, spCost: 1 },
      { id: "ar_pow_2", name: "Bow Strike", tree: "POW", levelReq: 27, spCost: 3 },
      { id: "ar_pow_3", name: "Armor Piercing Shot", tree: "POW", levelReq: 47, spCost: 5 },
      { id: "ar_pow_4", name: "Wrath of the Phoenix", tree: "POW", levelReq: 127, spCost: 15 },
    ],
  },
  {
    id: "brawler",
    name: "Brawler",
    description: "Close range – Gauntlets",
    weapons: "Gauntlets",
    skills: [
      { id: "br_int_1", name: "Head Crush", tree: "INT", levelReq: 7, spCost: 1 },
      { id: "br_int_2", name: "Elbow Crush", tree: "INT", levelReq: 27, spCost: 3 },
      { id: "br_int_3", name: "Earthquake Strike", tree: "INT", levelReq: 57, spCost: 6 },
      { id: "br_int_4", name: "Chi Finger Blast", tree: "INT", levelReq: 87, spCost: 9 },
      { id: "br_int_5", name: "Dynamite Punch", tree: "INT", levelReq: 107, spCost: 11 },
      { id: "br_int_6", name: "Dragon Rising", tree: "INT", levelReq: 147, spCost: 15 },
      { id: "br_dex_1", name: "Heavy Punch", tree: "DEX", levelReq: 7, spCost: 1 },
      { id: "br_dex_2", name: "Tokkan Punch", tree: "DEX", levelReq: 27, spCost: 3 },
      { id: "br_dex_3", name: "Critical Punch", tree: "DEX", levelReq: 77, spCost: 9 },
      { id: "br_dex_4", name: "Shintendouchi", tree: "DEX", levelReq: 97, spCost: 11 },
      { id: "br_dex_5", name: "TaiChi", tree: "DEX", levelReq: 147, spCost: 15 },
      { id: "br_pow_1", name: "Side Kick", tree: "POW", levelReq: 7, spCost: 1 },
      { id: "br_pow_2", name: "Spinning Kick", tree: "POW", levelReq: 27, spCost: 3 },
      { id: "br_pow_3", name: "Tornado Kick", tree: "POW", levelReq: 97, spCost: 10 },
      { id: "br_pow_4", name: "Rays Cyclone", tree: "POW", levelReq: 147, spCost: 15 },
    ],
  },
  {
    id: "shaman",
    name: "Shaman",
    description: "Mid/Close range – Wands / Spears",
    weapons: "Wands, Spears",
    skills: [
      { id: "sh_int_s1", name: "Breath of Life", tree: "INT", levelReq: 1, spCost: 1 },
      { id: "sh_int_s2", name: "Heaven's Treatment", tree: "INT", levelReq: 67, spCost: 7 },
      { id: "sh_int_s3", name: "Resurrection", tree: "INT", levelReq: 117, spCost: 12 },
      { id: "sh_int_a1", name: "Incineration", tree: "INT", levelReq: 7, spCost: 1 },
      { id: "sh_int_a2", name: "Gaia Dragon Strike", tree: "INT", levelReq: 47, spCost: 5 },
      { id: "sh_int_a3", name: "Petrify", tree: "INT", levelReq: 87, spCost: 9 },
      { id: "sh_int_a4", name: "Meteor Smash", tree: "INT", levelReq: 157, spCost: 14 },
      { id: "sh_pow_1", name: "Rapid Pierce", tree: "POW", levelReq: 1, spCost: 1 },
      { id: "sh_pow_2", name: "Lunar Catastrophe", tree: "POW", levelReq: 57, spCost: 6 },
      { id: "sh_pow_3", name: "Demon Spear Dance", tree: "POW", levelReq: 127, spCost: 13 },
    ],
  },
  {
    id: "extreme",
    name: "Extreme",
    description: "Close/Long range – Gauntlets / Bows / Swords / Wands (hybrid)",
    weapons: "Gauntlets, Bows, Swords, Wands",
    skills: [
      { id: "ex_1", name: "Extreme Strike", tree: "POW", levelReq: 7, spCost: 1 },
      { id: "ex_2", name: "Dual Style", tree: "DEX", levelReq: 27, spCost: 3 },
      { id: "ex_3", name: "Chaos Barrage", tree: "POW", levelReq: 47, spCost: 5 },
      { id: "ex_4", name: "Elemental Fusion", tree: "INT", levelReq: 57, spCost: 6 },
      { id: "ex_5", name: "Rage Burst", tree: "POW", levelReq: 87, spCost: 9 },
      { id: "ex_6", name: "Overdrive", tree: "ETC", levelReq: 97, spCost: 10 },
    ],
  },
  {
    id: "scientist",
    name: "Scientist",
    description: "Long range – Sniper Rifle / Portal Gun / Twin Pistols / Shotguns",
    weapons: "Rifles, Pistols, Shotguns",
    skills: [
      { id: "sc_1", name: "Precision Shot", tree: "DEX", levelReq: 7, spCost: 1 },
      { id: "sc_2", name: "Plasma Grenade", tree: "INT", levelReq: 27, spCost: 3 },
      { id: "sc_3", name: "Dual Fire", tree: "POW", levelReq: 47, spCost: 5 },
      { id: "sc_4", name: "Portal Jump", tree: "INT", levelReq: 57, spCost: 6 },
      { id: "sc_5", name: "Overcharge", tree: "POW", levelReq: 87, spCost: 9 },
      { id: "sc_6", name: "Nano Blast", tree: "INT", levelReq: 107, spCost: 11 },
    ],
  },
  {
    id: "assassin",
    name: "Assassin",
    description: "Close range – Scythe / Shuriken / Dual Swords",
    weapons: "Scythe, Shuriken, Dual Swords",
    skills: [
      { id: "as_1", name: "Shadow Strike", tree: "DEX", levelReq: 7, spCost: 1 },
      { id: "as_2", name: "Venom Slash", tree: "INT", levelReq: 27, spCost: 3 },
      { id: "as_3", name: "Blade Flurry", tree: "POW", levelReq: 47, spCost: 5 },
      { id: "as_4", name: "Death Mark", tree: "INT", levelReq: 67, spCost: 7 },
      { id: "as_5", name: "Phantom Cut", tree: "DEX", levelReq: 87, spCost: 9 },
      { id: "as_6", name: "Execute", tree: "POW", levelReq: 107, spCost: 11 },
    ],
  },
  {
    id: "magician",
    name: "Magician",
    description: "Close/Mid range – Stave / Whip / Cube",
    weapons: "Stave, Whip, Cube",
    skills: [
      { id: "mg_1", name: "Arcane Bolt", tree: "INT", levelReq: 7, spCost: 1 },
      { id: "mg_2", name: "Chain Lightning", tree: "INT", levelReq: 27, spCost: 3 },
      { id: "mg_3", name: "Ice Prison", tree: "INT", levelReq: 47, spCost: 5 },
      { id: "mg_4", name: "Whip Lash", tree: "POW", levelReq: 57, spCost: 6 },
      { id: "mg_5", name: "Meteor", tree: "INT", levelReq: 87, spCost: 9 },
      { id: "mg_6", name: "Void Cube", tree: "INT", levelReq: 107, spCost: 11 },
    ],
  },
  {
    id: "shaper",
    name: "Shaper",
    description: "Close/Mid range – Shield / Hammer / Umbrella",
    weapons: "Shield, Hammer, Umbrella",
    skills: [
      { id: "sp_1", name: "Shield Bash", tree: "POW", levelReq: 7, spCost: 1 },
      { id: "sp_2", name: "Hammer Smash", tree: "POW", levelReq: 27, spCost: 3 },
      { id: "sp_3", name: "Umbrella Guard", tree: "DEX", levelReq: 47, spCost: 5 },
      { id: "sp_4", name: "Earth Shaker", tree: "POW", levelReq: 67, spCost: 7 },
      { id: "sp_5", name: "Form Shift", tree: "INT", levelReq: 87, spCost: 9 },
      { id: "sp_6", name: "Titan's Wrath", tree: "POW", levelReq: 107, spCost: 11 },
    ],
  },
];

export function getClassById(id: string): RanClass | undefined {
  return RAN_CLASSES.find((c) => c.id === id);
}

export function getSkillById(classId: string, skillId: string): Skill | undefined {
  const c = getClassById(classId);
  return c?.skills.find((s) => s.id === skillId);
}
