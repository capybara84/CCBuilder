import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from './game/Game';

async function main() {
  // Rapier WASM 初期化
  await RAPIER.init();

  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  if (!canvas) throw new Error('canvas not found');

  const gravity = new RAPIER.Vector3(0, -9.81, 0);
  const physicsWorld = new RAPIER.World(gravity);

  const game = new Game(canvas, physicsWorld);
  (window as any).__game = game;
  game.start();
}

main().catch(console.error);
