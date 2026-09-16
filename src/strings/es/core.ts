// src/strings/es/core.ts
//
// Game data display names (looked up by stable id) and small helpers.
// Registry `name` fields stay English: server logic compares them.

import { DangerLevel, EquipmentType, ZombieType, type EquipmentCard } from '../../types/GameState';

/** `plural(2, 'zombi', 'zombis')` → `'zombis'`. Returns the word only, no count. */
export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** Keyed by `equipmentId` (registry key in EQUIPMENT_CARDS / EPIC_EQUIPMENT_CARDS). */
export const equipment: Record<string, string> = {
  fire_axe: 'Hacha de bombero',
  crowbar: 'Palanca',
  pistol: 'Pistola',
  shotgun: 'Escopeta',
  sniper_rifle: 'Rifle de francotirador',
  canned_food: 'Comida en lata',
  water: 'Agua',
  flashlight: 'Linterna',
  molotov: 'Molotov',
  baseball_bat: 'Bate de béisbol',
  katana: 'Katana',
  machete: 'Machete',
  chainsaw: 'Motosierra',
  sawed_off: 'Recortada',
  sub_mg: 'Subfusil',
  plenty_of_bullets: 'Munición de sobra',
  kukri: 'Kukri',
  bag_of_rice: 'Bolsa de arroz',
  plenty_of_shells: 'Cartuchos de sobra',
  aaahh: 'Aaahh!!',
  aaahh_epic: 'Aaahh!!',
  army_sniper_rifle: 'Rifle de francotirador militar',
  automatic_shotgun: 'Escopeta automática',
  evil_twins: 'Gemelas malvadas',
  golden_ak47: 'AK-47 dorado',
  golden_kukri: 'Kukri dorado',
  gunblade: 'Gunblade',
  mas_shotgun: 'Escopeta de mamá',
  nailbat: 'Bate con clavos',
  zantetsuken: 'Zantetsuken',
};

/** Keyed by skill id (SKILL_DEFINITIONS key). */
export const skills: Record<string, { name: string; description: string }> = {
  start_move: { name: 'Inicio: Moverse', description: 'Empieza la partida con una acción de Moverse gratuita.' },
  plus_1_action: { name: '+1 acción', description: 'El superviviente tiene una acción extra por turno.' },
  plus_1_damage_melee: { name: '+1 al daño: cuerpo a cuerpo', description: 'El superviviente suma +1 al daño con armas cuerpo a cuerpo.' },
  plus_1_damage_ranged: { name: '+1 al daño: a distancia', description: 'El superviviente suma +1 al daño con armas a distancia.' },
  plus_1_die_melee: { name: '+1 dado: cuerpo a cuerpo', description: 'El superviviente tira un dado extra con armas cuerpo a cuerpo.' },
  plus_1_die_ranged: { name: '+1 dado: a distancia', description: 'El superviviente tira un dado extra con armas a distancia.' },
  plus_1_free_move: { name: '+1 acción de Moverse gratuita', description: 'El superviviente tiene una acción de Moverse gratuita por turno.' },
  plus_1_free_search: { name: '+1 acción de Buscar gratuita', description: 'El superviviente tiene una acción de Buscar gratuita por turno.' },
  plus_1_free_combat: { name: '+1 acción de combate gratuita', description: 'El superviviente tiene una acción de combate (cuerpo a cuerpo o a distancia) gratuita por turno.' },
  lucky: { name: 'Suertudo', description: 'En cada acción, el superviviente puede volver a tirar todos los dados una vez.' },
  sniper: { name: 'Francotirador', description: 'El superviviente elige libremente los objetivos de sus ataques a distancia.' },
  tough: { name: 'Duro', description: 'El superviviente ignora la primera herida que recibe en cada turno.' },
  sprint: { name: 'Esprintar', description: 'El superviviente puede moverse hasta 3 zonas con 1 acción.' },
  slippery: { name: 'Escurridizo', description: 'El superviviente no gasta acciones extra para salir de una zona con zombis.' },
  plus_1_max_range: { name: '+1 al alcance máximo', description: 'El superviviente suma +1 al alcance máximo de todas las armas a distancia.' },
  plus_1_to_dice_roll_ranged: { name: '+1 a la tirada: a distancia', description: 'El superviviente suma +1 a cada dado en ataques a distancia. El resultado máximo es 6.' },
  steady_hand: { name: 'Pulso firme', description: 'Al resolver fuego amigo, el superviviente elige qué supervivientes quedan a salvo.' },
  search_anywhere: { name: 'Buscar: en cualquier lugar', description: 'El superviviente puede buscar en cualquier zona (calle o edificio).' },
  plus_1_zone_per_move: { name: '+1 zona por movimiento', description: 'El superviviente puede moverse 1 o 2 zonas con una acción de Moverse. Entrar en una zona con zombis termina el movimiento.' },
  charge: { name: 'Carga', description: 'Una vez por turno, gratis: moverse hasta 2 zonas hacia una zona con al menos 1 zombi.' },
  hit_and_run: { name: 'Golpear y correr', description: 'Tras un ataque que elimina al menos 1 zombi: acción de Moverse gratuita, sin acciones extra por zombis en la zona.' },
  plus_1_die_combat: { name: '+1 dado: combate', description: 'El superviviente tira un dado extra con todas las armas.' },
  plus_1_damage_combat: { name: '+1 al daño: combate', description: 'El superviviente suma +1 al daño con todas las armas.' },
  plus_1_free_melee: { name: '+1 acción cuerpo a cuerpo gratuita', description: 'El superviviente tiene una acción cuerpo a cuerpo gratuita por turno.' },
  plus_1_free_ranged: { name: '+1 acción a distancia gratuita', description: 'El superviviente tiene una acción a distancia gratuita por turno.' },
  ambidextrous: { name: 'Ambidiestro', description: 'Trata todas las armas como si fueran dobles.' },
  barbarian: { name: 'Bárbaro', description: 'En un ataque cuerpo a cuerpo, puede reemplazar los dados del arma por la cantidad de zombis en la zona.' },
  swordmaster: { name: 'Maestro de espadas', description: 'Trata todas las armas cuerpo a cuerpo como si fueran dobles.' },
  super_strength: { name: 'Superfuerza', description: 'Las armas cuerpo a cuerpo de este superviviente tienen daño 3.' },
  reaper_combat: { name: 'Segador: combate', description: 'Cada impacto puede eliminar gratis 1 zombi idéntico más. Gana PX por la eliminación extra.' },
  reaper_melee: { name: 'Segador: cuerpo a cuerpo', description: 'Cada impacto cuerpo a cuerpo puede eliminar gratis 1 zombi idéntico más. Gana PX por la eliminación extra.' },
  point_blank: { name: 'A quemarropa', description: 'Puede atacar a distancia en alcance 0 sin importar el alcance mínimo. En alcance 0 elige los objetivos y no hay fuego amigo.' },
  born_leader: { name: 'Líder nato', description: 'Durante su turno: da 1 acción gratuita a otro superviviente de la misma zona (se usa enseguida).' },
  bloodlust_melee: { name: 'Sed de sangre: cuerpo a cuerpo', description: 'Una vez por turno: gasta 1 acción para moverse hasta 2 zonas hacia una zona con al menos 1 zombi y gana 1 acción cuerpo a cuerpo gratuita.' },
  is_that_all_youve_got: { name: '¿Eso es todo lo que tenés?', description: 'Al recibir heridas: evita 1 herida por cada carta de equipo descartada.' },
  lifesaver: { name: 'Salvavidas', description: 'Una vez por turno, gratis: elige una zona a alcance 1 con zombis y supervivientes, y trae a su zona a los supervivientes elegidos.' },
  hold_your_nose: { name: 'Tapate la nariz', description: 'Roba una carta de equipo cada vez que se elimina al último zombi de su zona. No es una acción de Buscar.' },
  medic: { name: 'Médico', description: 'Gratis en cada fase final: este superviviente y los de su zona pueden curar 1 herida.' },
  matching_set: { name: 'Juego completo', description: 'Al encontrar un arma doble buscando, toma enseguida una segunda copia del mazo de equipo.' },
  search_plus_1: { name: 'Buscar: +1 carta', description: 'Roba 2 cartas al buscar en lugar de 1.' },
  can_search_more_than_once: { name: 'Buscar más de una vez', description: 'Puede buscar varias veces por turno (1 acción por búsqueda).' },
  low_profile: { name: 'Perfil bajo', description: 'No lo alcanza el fuego amigo (el Molotov sí).' },
  starts_with_equipment: { name: 'Empieza con equipo', description: 'Empieza la partida con un equipo específico.' },
};

export const zombies: Record<ZombieType, { one: string; many: string }> = {
  [ZombieType.Walker]: { one: 'Caminante', many: 'Caminantes' },
  [ZombieType.Runner]: { one: 'Corredor', many: 'Corredores' },
  [ZombieType.Brute]: { one: 'Bruto', many: 'Brutos' },
  [ZombieType.Abomination]: { one: 'Abominación', many: 'Abominaciones' },
};

export const danger: Record<DangerLevel, string> = {
  [DangerLevel.Blue]: 'Azul',
  [DangerLevel.Yellow]: 'Amarillo',
  [DangerLevel.Orange]: 'Naranja',
  [DangerLevel.Red]: 'Rojo',
};

export const itemTypes: Record<EquipmentType, string> = {
  [EquipmentType.Weapon]: 'Arma',
  [EquipmentType.Item]: 'Objeto',
};

export const slots: Record<NonNullable<EquipmentCard['slot']>, string> = {
  HAND_1: 'Mano 1',
  HAND_2: 'Mano 2',
  BACKPACK: 'Mochila',
  BACKPACK_0: 'Mochila 1',
  BACKPACK_1: 'Mochila 2',
  BACKPACK_2: 'Mochila 3',
  DISCARD: 'Descarte',
};

/** Short role under each character, keyed by character name. */
export const roles: Record<string, string> = {
  Wanda: 'Exploradora',
  Doug: 'Líder',
  Amy: 'Escurridiza',
  Ned: 'Buscador',
  Elle: 'Tiradora',
  Josh: 'Peleador',
};

/** Keyed by `ActionType` value. */
export const actions: Record<string, string> = {
  JOIN_LOBBY: 'Entrar a la sala',
  UPDATE_NICKNAME: 'Cambiar nombre',
  SELECT_CHARACTER: 'Elegir superviviente',
  START_GAME: 'Empezar partida',
  END_GAME: 'Terminar partida',
  MOVE: 'Moverse',
  ATTACK: 'Atacar',
  SEARCH: 'Buscar',
  OPEN_DOOR: 'Abrir puerta',
  MAKE_NOISE: 'Hacer ruido',
  TRADE_START: 'Intercambiar',
  TRADE_OFFER: 'Ofrecer',
  TRADE_ACCEPT: 'Aceptar intercambio',
  TRADE_CANCEL: 'Cancelar intercambio',
  ORGANIZE: 'Organizar',
  CHOOSE_SKILL: 'Elegir habilidad',
  RESOLVE_SEARCH: 'Resolver búsqueda',
  TAKE_OBJECTIVE: 'Tomar objetivo',
  TAKE_EPIC_CRATE: 'Abrir caja de armas épicas',
  SPRINT: 'Esprintar',
  USE_ITEM: 'Usar objeto',
  NOTHING: 'Nada',
  END_TURN: 'Terminar turno',
  CHARGE: 'Carga',
  BORN_LEADER: 'Líder nato',
  BLOODLUST_MELEE: 'Sed de sangre',
  LIFESAVER: 'Salvavidas',
  RESOLVE_WOUNDS: 'Resolver heridas',
  DISTRIBUTE_ZOMBIE_WOUNDS: 'Repartir heridas',
  KICK_PLAYER: 'Sacar jugador',
  REROLL_LUCKY: 'Volver a tirar',
  ACTIVATE_CHEAT: 'Truco',
};

export const zones = {
  cell: (x: string | number, y: string | number) => `Casilla (${x}, ${y})`,
  street: (x: string | number, y: string | number) => `Zona de calle (${x}, ${y})`,
  building: (x: string | number, y: string | number) => `Zona de edificio (${x}, ${y})`,
  spawn: (n: number) => `Aparición ${n}`,
};

export function equipmentName(card: { equipmentId?: string; name: string }): string {
  return (card.equipmentId && equipment[card.equipmentId]) || card.name;
}

export function skillName(id: string): string {
  return skills[id]?.name ?? id;
}

export function skillDescription(id: string): string {
  return skills[id]?.description ?? '';
}

export function zombieLabel(type: ZombieType, n = 1): string {
  const z = zombies[type];
  return z ? plural(n, z.one, z.many) : type;
}
