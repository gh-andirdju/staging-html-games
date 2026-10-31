# Dash Arena engine contract

Rust source owns gameplay and geometry; JS exposes browser APIs. Keep this interface stable across agents.

## Shared Rust types (simulation lib.rs owns; renderer.rs child module can read parent fields)

World ground uses x,z; height is y. Arena clamp +/-14.0. Fixed step1/60s, round5400frames, boss arrives3600.

- `pub struct Player { pub x:f32,z:f32,vx:f32,vz:f32,hp:f32,aim_x:f32,aim_z:f32,dash_frames:u32,dash_cd:u32,hurt_frames:u32 }` (aim_x/z are unit direction).
- `pub struct Enemy { pub id:u32,kind:u32,x:f32,z:f32,vx:f32,vz:f32,hp:f32,max_hp:f32,attack_tick:u32,flash:u32,spawn:u32,heading:f32 }`. kind0rusher/1gunner/2flanker/3boss.
- `pub struct Bullet { pub x:f32,z:f32,y:f32,px:f32,pz:f32,dx:f32,dz:f32,radius:f32,life:u32,damage:f32,owner:u32,kind:u32 }`. dx/dz velocity units/sec; owner0player/1enemy; kind0blaster/1shotgun/2launcher/3enemy. Swept collision.
- `pub struct Prop { pub x:f32,z:f32,w:f32,d:f32,h:f32,hp:f32,max_hp:f32,kind:u32 }` half extents w,d, kind0cover/1explosivebarrel; hp<=0gone.
- `pub struct Particle { pub x:f32,y:f32,z:f32,vx:f32,vy:f32,vz:f32,size:f32,life:u32,max_life:u32,kind:u32 }`. kind0cyan/1coral/2amber/3violet/4smoke/5white.
- `pub struct Game { pub tick:u32,phase:u32,player:Player,enemies:Vec<Enemy>,bullets:Vec<Bullet>,particles:Vec<Particle>,props:Vec<Prop>,score:u32,kills:u32,combo:u32,max_combo:u32,last_kill_tick:u32,weapon:u32,shot_cd:u32,boss_spawned:bool,boss_dead:bool,shots:u32,explosions:u32,props_destroyed:u32,damage_taken:u32,dashes:u32,cam_x:f32,cam_z:f32,...private fields allowed }`.
- Global `pub fn game() -> &'static mut Game` exported internally to renderer child. Single-threaded browser Wasm. Native unit tests instantiate Game directly (no concurrent global mutation).

Phase0ready/1playing/2paused/3won/4lost. Weapon0blaster/1shotgun/2launcher.

Camera: VIEW_HEIGHT=24.0, aspect=canvasCSSwidth/height. Center game.cam_x/z. Project world point:
`sx=((x-cam_x)-(z-cam_z))*0.8660254; sy=((x-cam_x)+(z-cam_z))*0.5-y*1.2; clip=(2*sx/(24*aspect),-2*sy/24,-((x-cam_x+z-cam_z)*0.5+y*0.7)/50)`.
Aim input nx/ny is NDC positiveUP: sx=nx*12*aspect, sy=-ny*12+0.78 (aim height.65), worldx=cam_x+(sx/.8660254+sy/.5)/2, worldz=cam_z+(sy/.5-sx/.8660254)/2.
Movement input mx/my screen coords positiveRIGHT/DOWN; convert x=(mx+my)*.7071068,z=(my-mx)*.7071068. Normalize diagonal before speed. Camera smoothly follows .65*player at per-step lerp.08.

## Wasm exports (simulation)

`engine_version()->u32`=1; `reset(seed:u32)`ready; `start(seed:u32)`playing; `set_paused(value:u32)`; `step(frames:u32)`.
`input(mx:f32,my:f32,aim_nx:f32,aim_ny:f32,fire:u32,dash:u32,weapon:u32,autoaim:u32,aspect:f32)` is legacy NDC input for low-level tests. Desktop uses `input_keyboard(mx:f32,my:f32,ax:f32,ay:f32,fire:u32,dash:u32,weapon:u32,autoaim:u32,aspect:f32)`: ax/ay is arrow-key direction positive right/down, converted to world direction in Rust; zero retains facing. dash is one-shot request, weapon0..2.
`hud_ptr()->*const f32` updates and returns32f32:
[phase,tick,timeLeftSeconds,score,kills,combo,maxCombo,playerX,playerZ,hp,dashCd,dashFrames,weapon,enemyCount,bulletCount,particleCount,bossHp,bossMaxHp,bossPresent,bossDead,shots,explosions,propsDestroyed,damageTaken,dashes,aimX,aimZ,camX,camZ,0,0,0].
`snapshot_ptr()->*const u8`, `snapshot_len()->usize`: snapshot_ptr refreshes stored JSON, snapshot_len returns byte length. JSON named Game fields camelCase: phase,tick,timeLeft,score,kills,combo,maxCombo,weapon,bossSpawned,bossDead,shots,explosions,propsDestroyed,damageTaken,dashes,camX,camZ,player:{x,z,hp,aimX,aimZ,dashFrames,dashCd,hurtFrames}, enemies:[{id,kind,x,z,hp,maxHp}],bullets:[{x,z,dx,dz,kind,owner,damage,life}],props:[{x,z,w,d,h,hp,maxHp,kind}],particleCount.
Testing exports: `test_set_tick(tick)`, `test_set_player(x,z,hp)`, `test_clear_enemies()`, `test_clear_bullets()`, `test_clear_props()`, `test_spawn_enemy(kind,x,z,hp)->u32`, `test_spawn_bullet(owner,kind,x,z,dx,dz,damage)`, `test_set_weapon(weapon)`, `test_scene()` deterministic visually rich playing scene, `test_stress(count)` performance scene.

## Wasm exports (renderer)

`render(aspect:f32)->u32` refreshes dynamic vertex buffer and returns vertex count. `vertices_ptr()->*const f32`. Each vertex7f32: clipX,clipY,clipZ,R,G,B,A. GPU draws triangles with depth test and alpha blending, single buffer upload/draw call. Colors/geometry/lighting computed in Rust. Viewport cleared navy by bridge, then floor/walls/cover/barrels/avatars/shadows/projectiles/trails/particles/aim marker generated Rust. Renderer must use shared projection formula. No GPU host imports required in Wasm. Native renderer tests can run on pure output; render calls global game but other helpertests use independent Game.

## Browser engine facade (main owns src/engine.js)

`loadEngine(version)` async => {kind:'rust-wasm',renderer:'rust-webgl2',reset(seed),start(seed),pause(bool),input({moveX,moveY,keyboardAim:true,aimDirX,aimDirY,fire,dash,weapon,autoAim},aspect),step(frames),hud()->object,getState()->JSON,render(gl,aspect)->vertexCount,test:{setTick,setPlayer,clearEnemies,clearBullets,clearProps,spawnEnemy,spawnBullet,setWeapon,prepareVisualLayout,stress}}.
JS HUD object names same snapshot, includes enemyCount,bulletCount,particleCount,bossHp,bossMaxHp,bossPresent. Engine GL render caches resources, uploads7f32vertices and draws gl.TRIANGLES; app sets actual backing pixel size and viewport. App handles pause-on-blur, fixed-step accumulator, browser pointer/keyboard, UI, audio and versioned loader.

## Browser test hook (UI agent owns)

window.__dashArenaTest={isReady:true,buildId,engine:'rust-wasm',renderer:'rust-webgl2',getState(),start(seed=1),reset(seed=1),setAutoStep(bool),advanceFrames(frames),setInput({...}),setWeapon(index),prepareVisualLayout(),getMetrics(),...engine.test forwarding helpers}. All mutations render + refresh HUD immediately. advanceFrames runs synchronous step then render. prepareVisualLayout stops autostep, test_scene(), render + await document.fonts.ready. No wallclock gameplay dependencies.
