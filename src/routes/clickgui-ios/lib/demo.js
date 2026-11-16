// Demo data. In LiquidBounce, build this same shape from the client's module + value API.
//
// categories = [{ name, icon, modules: [{ name, enabled, settings: [...] }] }]
//   icon     inner SVG markup for a 16x16 viewBox
//   settings { type: 'toggle', name, value }
//            { type: 'slider', name, value, min, max, step }
//            { type: 'choice', name, value, options: [...] }
//            { type: 'bind',   name, value }
//            { type: 'group',  name, open?, children: [...settings] }   (nestable)
//
// Below, "*Name" in a module list just means "enabled by default" for this demo.

const base = () => [
  { type: 'bind', name: 'Bind', value: 'None' },
  { type: 'toggle', name: 'Hidden', value: false }
];
const generic = () => [
  { type: 'slider', name: 'Strength', value: 50, min: 0, max: 100, step: 1 },
  { type: 'choice', name: 'Mode', value: 'Normal', options: ['Normal', 'Strict', 'Legit'] }
];
const hud = () => [
  ...base(),
  { type: 'toggle', name: 'Blur', value: false },
  { type: 'toggle', name: 'Space separated names', value: false },
  { type: 'toggle', name: 'Centered crosshair', value: true },
  { type: 'group', name: 'In built', open: true, children: [
    { type: 'toggle', name: 'Watermark', value: true },
    { type: 'toggle', name: 'Array list', value: true },
    { type: 'toggle', name: 'Notifications', value: true },
    { type: 'toggle', name: 'Hotbar', value: true }
  ]},
  { type: 'group', name: 'Alignment', children: [
    { type: 'choice', name: 'Horizontal', value: 'Center', options: ['Center', 'Left', 'Right'] },
    { type: 'slider', name: 'Horizontal offset', value: 0, min: -100, max: 100, step: 1 },
    { type: 'choice', name: 'Vertical', value: 'Bottom', options: ['Bottom', 'Top', 'Center'] },
    { type: 'slider', name: 'Vertical offset', value: 15, min: -100, max: 100, step: 1 }
  ]}
];

// "*Name" = enabled by default
const mods = (list) => list.map((n) => {
  const enabled = n[0] === '*';
  const name = enabled ? n.slice(1) : n;
  return { name, enabled, settings: name === 'HUD' ? hud() : [...base(), ...generic()] };
});

import { icons } from './icons.js';


const raw = {
  Exploit: ['Ghost Hand','Kick','More Carry','Multi Actions','Name Collector','No Pitch Limit','Phase','Ping Spoof','Plugins','Portal Menu','Reset VL','Server Crasher','Sleep Walker','Teleport','Time Shift','Vehicle One Hit'],
  World: ['Auto Build','Auto Disable','Auto Farm','Auto Tool','*Auto Trap','Bed Defender','Block In','Block Trap','Extinguish','Fast Break','Fast Place','Fucker','Hole Filler','Inventory Tracker','Liquid Place','No Slow Break'],
  Render: ['*HUD','Animations','Breadcrumbs','Camera','ESP','Fullbright','Name Tags','No Bob','Storage ESP','Tracers','Trajectories','Zoom'],
  Movement: ['Elytra Fly','Elytra Recast','Entity Control','Extended Firework','Fly','Freeze','High Jump','Inventory Move','Liquid Walk','Long Jump','No Clip','*No Jump Delay','No Push','No Slow','No Swim','Speed','Sprint','Step'],
  Combat: ['Aimbot','*Auto Armor','*Auto Bow','*Auto Clicker','*Auto Dodge','Auto Leave','Auto Pearl','Auto Shoot','*Auto Weapon','*Backtrack','*Criticals','Crystal Aura','Elytra Target','Fake Lag','Hitbox','Keep Sprint','Kill Aura','Velocity'],
  Misc: ['Anti Bot','Anti Cheat Detect','Anti Staff','Auto Account','Auto Chat Game','Debug Recorder','Easy Pearl','Flag Check','Item Scroller','Middle Click Action','Name Protect','Notifier','Packet Logger','Spammer','Target Lock','*Teams'],
  Player: ['Blink','*Chest Stealer','Eagle','Elytra Swap','Fast Exp','Fast Use','*Inventory Cleaner','No Entity Interact','No Fall','No Rotate Set','No Slot Set','Offhand','Potion Spoof','Reach','Replenish','Smart Eat'],
  Client: ['Auto Config','*Liquid Chat','Rich Presence','Targets','Translation'],
  Fun: ['Dank Bobbing','Derp','Hand Derp','Skin Derp','Twerk','Vomit']
};

export const categories = Object.entries(raw).map(([name, list]) => ({
  name, icon: icons[name], modules: mods(list)
}));
