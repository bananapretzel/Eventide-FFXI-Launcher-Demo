import type { Post } from "../types/feed";

const samplePosts: Post[] = [
  {
    id: "1",
    title: "Patch Update 10/31/2025",
    body: `[BST]
Lullaby Melodia is now scaling with the new merit change.
Pet Scaling should be resolved with merits due to rounding error.

[QOL]
Altepa Gate now opens from the front if your nation rank is 6 or higher.

[DRK]
Muted Soul should work properly

[SMN]
Spirit Perpetuation has been significantly lowered.

[Damage Immunities]
Bard threnodys & Blue magic are now properly effected by damage resistances & buffs

[End Game]
Tiamat is now live.  Good luck.  Please coordinate with me so I can make sure fight is working properly.  Have fun.

Wyrm horn drop rate has been standardized to 10% on all T4 HNM

T4 HNM loot tables have been enhanced.  Papers have been added to T4 Hnms.

[Events]
BCNM/KSNM Orb event is now live for the next 2-3 weeks.`,
  },
  {
    id: "2",
    title: "Patch Update 10/24/25",
    body: `[BST]
pet buff issues should now be resolved and properly effect the player.

[Bug fixes]
Failsafe added for too much damage happening on Horns of War KS99.
lance corperal quest should trigger properly

[Known issues]
Lullaby Melodia is not scaling with the new merit change.
Some of the math on the pet scaling due to new merit change is slightly off due to a rounding error.`,
  },
  {
    id: "3",
    title: "Patch Update 10/23/25",
    body: `[BST]
- Beast affinity now effectively uncaps every HQ jug 20% at a time.  I.E. 1 point in beast affinity on a HQ jug capped at 55 would make it level 59. 5/5 = 75
- Jug debuffs are no longer considered elemental in the magic accuracy calculation.  The Bst's charisma is now used instead of pets int as a modifier to pet macc in addition to pet:macc.
- Pet buffs now effect both the pet and the master. buffs that effect both the pet & beastmaster:
    Bubble Curtain
    Metallic Body
    Rage
    Rhino Gaurd
    Scissor Gaurd
    Secretion

[DRG]
Wyvern is summoned before a spirit link with 1 HP if its not alive.  It is then healed by the spirit link.

[THF]
TA should be a little less fussy in terms of positioning. Please give feedback on this.

[Weapon Skill Changes]
Cor and RNG aftermaths on relics have been updated.
 - Crit Hit rate 5%
 - Racc +20
 - Snapshot 5%
 - Enmity -20
 - Haste 5%

Pets also *should* have the effects of gained aftermaths.

[Magic]
Player character spikes damage has been doubled.

[Battlefields]
Gunpods no longer drop SCH & DNC items.

[Combat]
Shield/Gaurd/Parry radius has been widened to make mass pulling of mobs easier. Please give feedback on this.

[HNM]
Yoichi's Sash is now available on T3 HNMS shops

[KS99]
Loot tables have been adjusted to account for missing ENMS + Koga Shuriken.  Each ks99 has a different loot pool.

[NMs]
Absolute Virtue is now working.  His lockout timer is now 9s. Good luck

[Crafting]
Khromated leather is now craftable
Pot-au-feu is now craftable

[Bug fixes]
Ancient Lockbox should now work in leujaoam sanctum`,
  },
  {
    id: "4",
    title: "Patch Update 09/15/25",
    body: `[NIN]
Innin enmity bugs fixed.

[Jormungand]
No longer sleepable with light shot.

[Balgas Dias]
Server message on zone to assist with frozen BCNM menus.

[Sea]
Quasi doors should now be usable from both sides if you have completed the Dawn mission too allow easier navigation.
Major changes to AV and JOL.

[BLU]
Diffusion effect adjusted -- Should be stronger now.

[Crafting]
Error with renouncing a craft fixed.`,
  },

];

export default samplePosts;
