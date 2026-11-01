//! Fixed-step, seeded Dash Arena simulation. Browser bindings never decide rules.
//! The exported singleton is accessed on one browser thread; native tests use
//! independent Game values so the test runner never shares mutable engine state.
use std::fmt::Write;

mod renderer;

const DT: f32 = 1.0 / 60.0;
const LIMIT: f32 = 14.0;
const ROUND_FRAMES: u32 = 5400;
const BOSS_FRAME: u32 = 3600;
const MAX_ENEMIES: usize = 180;
const MAX_BULLETS: usize = 4096;
const MAX_PARTICLES: usize = 4096;
const GRID_SIZE: usize = 14;
const CELL: f32 = 2.5;

#[derive(Clone, Debug)]
pub struct Player {
    pub x: f32,
    pub z: f32,
    pub vx: f32,
    pub vz: f32,
    pub hp: f32,
    pub aim_x: f32,
    pub aim_z: f32,
    pub dash_frames: u32,
    pub dash_cd: u32,
    pub hurt_frames: u32,
}
#[derive(Clone, Debug)]
pub struct Enemy {
    pub id: u32,
    pub kind: u32,
    pub x: f32,
    pub z: f32,
    pub vx: f32,
    pub vz: f32,
    pub hp: f32,
    pub max_hp: f32,
    pub attack_tick: u32,
    pub flash: u32,
    pub spawn: u32,
    pub heading: f32,
}
#[derive(Clone, Debug)]
pub struct Bullet {
    pub x: f32,
    pub z: f32,
    pub y: f32,
    pub px: f32,
    pub pz: f32,
    pub dx: f32,
    pub dz: f32,
    pub radius: f32,
    pub life: u32,
    pub damage: f32,
    pub owner: u32,
    pub kind: u32,
}
#[derive(Clone, Debug)]
pub struct Prop {
    pub x: f32,
    pub z: f32,
    pub w: f32,
    pub d: f32,
    pub h: f32,
    pub hp: f32,
    pub max_hp: f32,
    pub kind: u32,
}
#[derive(Clone, Debug)]
pub struct Particle {
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub vx: f32,
    pub vy: f32,
    pub vz: f32,
    pub size: f32,
    pub life: u32,
    pub max_life: u32,
    pub kind: u32,
}
#[derive(Clone, Default)]
struct Control {
    keyboard_aim: bool,
    continuous_aim: bool,
    turn: f32,
    fine_aim: bool,
    mx: f32,
    my: f32,
    nx: f32,
    ny: f32,
    fire: bool,
    dash: bool,
    autoaim: bool,
    aspect: f32,
}
struct Grid {
    cells: [Vec<usize>; GRID_SIZE * GRID_SIZE],
}
impl Grid {
    fn new() -> Self {
        Self {
            cells: std::array::from_fn(|_| Vec::new()),
        }
    }
    fn cell(value: f32) -> usize {
        (((value + 17.5) / CELL).floor() as i32).clamp(0, GRID_SIZE as i32 - 1) as usize
    }
    fn rebuild(&mut self, enemies: &[Enemy]) {
        for cell in &mut self.cells {
            cell.clear();
        }
        for (i, e) in enemies.iter().enumerate() {
            if e.hp > 0.0 {
                self.cells[Self::cell(e.z) * GRID_SIZE + Self::cell(e.x)].push(i);
            }
        }
    }
}

pub struct Game {
    pub tick: u32,
    pub phase: u32,
    pub player: Player,
    pub enemies: Vec<Enemy>,
    pub bullets: Vec<Bullet>,
    pub particles: Vec<Particle>,
    pub props: Vec<Prop>,
    pub score: u32,
    pub kills: u32,
    pub combo: u32,
    pub max_combo: u32,
    pub last_kill_tick: u32,
    pub weapon: u32,
    pub shot_cd: u32,
    pub boss_spawned: bool,
    pub boss_dead: bool,
    pub shots: u32,
    pub explosions: u32,
    pub props_destroyed: u32,
    pub damage_taken: u32,
    pub dashes: u32,
    pub cam_x: f32,
    pub cam_z: f32,
    control: Control,
    rng: u32,
    next_id: u32,
    dash_dx: f32,
    dash_dz: f32,
    end_reason: u32,
    grid: Grid,
}

fn normal(x: f32, z: f32) -> (f32, f32) {
    let d = (x * x + z * z).sqrt();
    if d > 0.00001 {
        (x / d, z / d)
    } else {
        (0.0, 0.0)
    }
}
fn finite(value: f32) -> f32 {
    if value.is_finite() {
        value
    } else {
        0.0
    }
}
fn radius(kind: u32) -> f32 {
    if kind == 3 {
        1.25
    } else {
        0.44
    }
}

// Earliest segment-circle intersection, including a segment starting inside.
fn circle_hit(ax: f32, az: f32, bx: f32, bz: f32, cx: f32, cz: f32, r: f32) -> Option<f32> {
    let (vx, vz, ox, oz) = (bx - ax, bz - az, ax - cx, az - cz);
    let c = ox * ox + oz * oz - r * r;
    if c <= 0.0 {
        return Some(0.0);
    }
    let a = vx * vx + vz * vz;
    if a < 0.0000001 {
        return None;
    }
    let b = ox * vx + oz * vz;
    let disc = b * b - a * c;
    if disc < 0.0 {
        return None;
    }
    let t = (-b - disc.sqrt()) / a;
    if (0.0..=1.0).contains(&t) {
        Some(t)
    } else {
        None
    }
}
fn box_hit(ax: f32, az: f32, bx: f32, bz: f32, prop: &Prop, r: f32) -> Option<f32> {
    let mut enter: f32 = 0.0;
    let mut leave: f32 = 1.0;
    for (a, b, center, extent) in [(ax, bx, prop.x, prop.w + r), (az, bz, prop.z, prop.d + r)] {
        let delta = b - a;
        if delta.abs() < 0.000001 {
            if a < center - extent || a > center + extent {
                return None;
            }
        } else {
            let first = (center - extent - a) / delta;
            let second = (center + extent - a) / delta;
            enter = enter.max(first.min(second));
            leave = leave.min(first.max(second));
            if enter > leave {
                return None;
            }
        }
    }
    if enter <= 1.0 && leave >= 0.0 {
        Some(enter.max(0.0))
    } else {
        None
    }
}
fn slide(x: &mut f32, z: &mut f32, r: f32, props: &[Prop]) {
    *x = x.clamp(-LIMIT + r, LIMIT - r);
    *z = z.clamp(-LIMIT + r, LIMIT - r);
    for p in props.iter().filter(|p| p.hp > 0.0) {
        let near_x = x.clamp(p.x - p.w, p.x + p.w);
        let near_z = z.clamp(p.z - p.d, p.z + p.d);
        let (dx, dz) = (*x - near_x, *z - near_z);
        let d2 = dx * dx + dz * dz;
        if d2 >= r * r {
            continue;
        }
        if d2 > 0.0000001 {
            let d = d2.sqrt();
            *x += dx / d * (r - d);
            *z += dz / d * (r - d);
        } else {
            let sides = [
                (*x - (p.x - p.w), 0),
                ((p.x + p.w) - *x, 1),
                (*z - (p.z - p.d), 2),
                ((p.z + p.d) - *z, 3),
            ];
            let side = sides.iter().min_by(|a, b| a.0.total_cmp(&b.0)).unwrap().1;
            match side {
                0 => *x = p.x - p.w - r,
                1 => *x = p.x + p.w + r,
                2 => *z = p.z - p.d - r,
                _ => *z = p.z + p.d + r,
            }
        }
    }
    *x = x.clamp(-LIMIT + r, LIMIT - r);
    *z = z.clamp(-LIMIT + r, LIMIT - r);
}

impl Game {
    pub fn new(seed: u32) -> Self {
        let mut result = Self {
            tick: 0,
            phase: 0,
            player: Player {
                x: 0.0,
                z: 0.0,
                vx: 0.0,
                vz: 0.0,
                hp: 100.0,
                aim_x: 0.7071068,
                aim_z: -0.7071068,
                dash_frames: 0,
                dash_cd: 0,
                hurt_frames: 0,
            },
            enemies: Vec::with_capacity(256),
            bullets: Vec::with_capacity(1024),
            particles: Vec::with_capacity(2048),
            props: Vec::new(),
            score: 0,
            kills: 0,
            combo: 0,
            max_combo: 0,
            last_kill_tick: 0,
            weapon: 0,
            shot_cd: 0,
            boss_spawned: false,
            boss_dead: false,
            shots: 0,
            explosions: 0,
            props_destroyed: 0,
            damage_taken: 0,
            dashes: 0,
            cam_x: 0.0,
            cam_z: 0.0,
            control: Control {
                aspect: 1.8,
                ..Control::default()
            },
            rng: if seed == 0 { 1 } else { seed },
            next_id: 1,
            dash_dx: 0.0,
            dash_dz: 0.0,
            end_reason: 0,
            grid: Grid::new(),
        };
        for (x, z, w, d, h) in [
            (-5.0, -4.0, 1.6, 0.65, 1.2),
            (5.0, 4.0, 1.6, 0.65, 1.2),
            (-5.0, 5.0, 0.65, 1.5, 1.1),
            (5.0, -5.0, 0.65, 1.5, 1.1),
            (-9.0, 0.0, 0.8, 1.8, 1.4),
            (9.0, 0.0, 0.8, 1.8, 1.4),
            (0.0, -9.0, 1.8, 0.7, 1.3),
            (0.0, 9.0, 1.8, 0.7, 1.3),
        ] {
            result.props.push(Prop {
                x,
                z,
                w,
                d,
                h,
                hp: 85.0,
                max_hp: 85.0,
                kind: 0,
            });
        }
        for (x, z) in [
            (-6.5, -5.7),
            (-8.1, -5.7),
            (6.5, 5.7),
            (8.1, 5.7),
            (-7.0, 7.7),
            (7.0, -7.7),
            (-2.4, 9.0),
            (2.4, -9.0),
        ] {
            result.props.push(Prop {
                x,
                z,
                w: 0.4,
                d: 0.4,
                h: 0.9,
                hp: 25.0,
                max_hp: 25.0,
                kind: 1,
            });
        }
        result
    }
    fn rand(&mut self) -> f32 {
        self.rng ^= self.rng << 13;
        self.rng ^= self.rng >> 17;
        self.rng ^= self.rng << 5;
        (self.rng as f64 / u32::MAX as f64) as f32
    }
    pub fn start(&mut self) {
        self.phase = 1;
    }
    fn set_control(
        &mut self,
        mx: f32,
        my: f32,
        nx: f32,
        ny: f32,
        fire: bool,
        dash: bool,
        weapon: u32,
        autoaim: bool,
        aspect: f32,
    ) {
        self.control.keyboard_aim = false;
        self.control.continuous_aim = false;
        self.control.turn = 0.0;
        self.control.fine_aim = false;
        self.control.mx = finite(mx).clamp(-1.0, 1.0);
        self.control.my = finite(my).clamp(-1.0, 1.0);
        self.control.nx = finite(nx).clamp(-2.0, 2.0);
        self.control.ny = finite(ny).clamp(-2.0, 2.0);
        self.control.fire = fire;
        self.control.dash |= dash;
        self.control.autoaim = autoaim;
        self.control.aspect = finite(aspect).clamp(0.2, 8.0);
        self.weapon = weapon.min(2);
    }
    fn set_keyboard_control(
        &mut self,
        mx: f32,
        my: f32,
        ax: f32,
        ay: f32,
        fire: bool,
        dash: bool,
        weapon: u32,
        autoaim: bool,
        aspect: f32,
    ) {
        self.set_control(mx, my, ax, ay, fire, dash, weapon, autoaim, aspect);
        self.control.keyboard_aim = true;
    }
    fn set_turn_control(
        &mut self,
        mx: f32,
        my: f32,
        turn: f32,
        fine: bool,
        fire: bool,
        dash: bool,
        weapon: u32,
        autoaim: bool,
        aspect: f32,
    ) {
        self.set_control(mx, my, 0.0, 0.0, fire, dash, weapon, autoaim, aspect);
        self.control.continuous_aim = true;
        self.control.turn = finite(turn).clamp(-1.0, 1.0);
        self.control.fine_aim = fine;
    }
    fn burst(&mut self, x: f32, z: f32, count: usize, kind: u32, power: f32) {
        let free = MAX_PARTICLES.saturating_sub(self.particles.len());
        for _ in 0..count.min(free) {
            let a = self.rand() * std::f32::consts::TAU;
            let speed = (0.25 + self.rand() * 0.75) * power;
            let life = 18 + (self.rand() * 28.0) as u32;
            let vy = 1.0 + self.rand() * 3.0;
            let size = 0.06 + self.rand() * 0.12;
            self.particles.push(Particle {
                x,
                y: 0.5,
                z,
                vx: a.cos() * speed,
                vy,
                vz: a.sin() * speed,
                size,
                life,
                max_life: life,
                kind,
            });
        }
    }
    pub fn spawn_enemy(&mut self, kind: u32, x: f32, z: f32, hp: f32, grace: u32) -> u32 {
        let kind = kind.min(3);
        let id = self.next_id;
        self.next_id = self.next_id.wrapping_add(1);
        let default_hp = [34.0, 48.0, 42.0, 800.0][kind as usize];
        let health = if hp > 0.0 && hp.is_finite() {
            hp
        } else {
            default_hp
        };
        self.enemies.push(Enemy {
            id,
            kind,
            x: finite(x).clamp(-LIMIT, LIMIT),
            z: finite(z).clamp(-LIMIT, LIMIT),
            vx: 0.0,
            vz: 0.0,
            hp: health,
            max_hp: health,
            attack_tick: 40 + id * 17 % 65,
            flash: 0,
            spawn: grace,
            heading: 0.0,
        });
        if kind == 3 {
            self.boss_spawned = true;
        }
        id
    }
    fn spawn_wave(&mut self) {
        if self.enemies.iter().filter(|e| e.hp > 0.0).count() >= MAX_ENEMIES {
            return;
        }
        let a = self.rand() * std::f32::consts::TAU;
        let x = (self.player.x + a.cos() * 13.5).clamp(-13.0, 13.0);
        let z = (self.player.z + a.sin() * 13.5).clamp(-13.0, 13.0);
        let available = if self.tick < 600 {
            1
        } else if self.tick < 1500 {
            2
        } else {
            3
        };
        let kind = (self.rand() * available as f32) as u32;
        self.spawn_enemy(kind, x, z, 0.0, 24);
    }
    pub fn spawn_bullet(
        &mut self,
        owner: u32,
        kind: u32,
        x: f32,
        z: f32,
        dx: f32,
        dz: f32,
        damage: f32,
    ) {
        if self.bullets.len() >= MAX_BULLETS {
            return;
        }
        let life = if owner == 1 {
            170
        } else {
            [48, 18, 90][kind.min(2) as usize]
        };
        self.bullets.push(Bullet {
            x,
            y: 0.65,
            z,
            px: x,
            pz: z,
            dx,
            dz,
            radius: if kind == 2 && owner == 0 { 0.18 } else { 0.1 },
            life,
            damage,
            owner,
            kind,
        });
    }
    fn update_player(&mut self) {
        self.player.hurt_frames = self.player.hurt_frames.saturating_sub(1);
        self.player.dash_cd = self.player.dash_cd.saturating_sub(1);
        let (mx, my) = normal(self.control.mx, self.control.my);
        let (dx, dz) = (
            (mx + my) * std::f32::consts::FRAC_1_SQRT_2,
            (my - mx) * std::f32::consts::FRAC_1_SQRT_2,
        );
        let mut aim = None;
        if self.control.autoaim {
            aim = self
                .enemies
                .iter()
                .filter(|e| e.hp > 0.0 && e.spawn == 0)
                .min_by(|a, b| {
                    let da = (a.x - self.player.x).powi(2) + (a.z - self.player.z).powi(2);
                    let db = (b.x - self.player.x).powi(2) + (b.z - self.player.z).powi(2);
                    da.total_cmp(&db)
                })
                .map(|e| normal(e.x - self.player.x, e.z - self.player.z));
        }
        if aim.is_none() && self.control.continuous_aim {
            if self.control.turn != 0.0 {
                // Rotate the projected heading so turning feels uniform on screen,
                // then resolve the full continuous angle back onto the arena plane.
                let screen_x = (self.player.aim_x - self.player.aim_z) * 0.8660254;
                let screen_y = (self.player.aim_x + self.player.aim_z) * 0.5;
                let rate: f32 = if self.control.fine_aim { 45.0 } else { 150.0 };
                let angle = (screen_y.atan2(screen_x) + self.control.turn * rate.to_radians() * DT)
                    .rem_euclid(std::f32::consts::TAU);
                let ax = angle.cos();
                let ay = angle.sin();
                aim = Some(normal(ax / 0.8660254 + ay / 0.5, ay / 0.5 - ax / 0.8660254));
            }
        } else if aim.is_none() && self.control.keyboard_aim {
            // Arrow keys describe a screen direction, independent of player and
            // camera position. Invert the isometric ground projection in Rust.
            let ax = self.control.nx;
            let ay = self.control.ny;
            aim = Some(normal(ax / 0.8660254 + ay / 0.5, ay / 0.5 - ax / 0.8660254));
        } else if aim.is_none() && !self.control.autoaim {
            let sx = self.control.nx * 12.0 * self.control.aspect;
            let sy = -self.control.ny * 12.0 + 0.78;
            let tx = self.cam_x + (sx / 0.8660254 + sy / 0.5) * 0.5;
            let tz = self.cam_z + (sy / 0.5 - sx / 0.8660254) * 0.5;
            aim = Some(normal(tx - self.player.x, tz - self.player.z));
        }
        if let Some((ax, az)) = aim {
            if ax != 0.0 || az != 0.0 {
                self.player.aim_x = ax;
                self.player.aim_z = az;
            }
        }
        if self.control.dash && self.player.dash_cd == 0 && self.player.dash_frames == 0 {
            let direction = if dx.abs() + dz.abs() > 0.01 {
                (dx, dz)
            } else {
                (self.player.aim_x, self.player.aim_z)
            };
            self.dash_dx = direction.0;
            self.dash_dz = direction.1;
            self.player.dash_frames = 16;
            self.player.dash_cd = 75;
            self.dashes += 1;
            self.burst(self.player.x, self.player.z, 18, 0, 4.0);
        }
        self.control.dash = false;
        let (vx, vz) = if self.player.dash_frames > 0 {
            (self.dash_dx * 22.0, self.dash_dz * 22.0)
        } else {
            (dx * 6.5, dz * 6.5)
        };
        self.player.vx = vx;
        self.player.vz = vz;
        self.player.x += vx * DT;
        self.player.z += vz * DT;
        slide(&mut self.player.x, &mut self.player.z, 0.38, &self.props);
        self.shot_cd = self.shot_cd.saturating_sub(1);
        if self.control.fire && self.shot_cd == 0 {
            self.fire_player();
        }
        self.cam_x += (self.player.x * 0.65 - self.cam_x) * 0.08;
        self.cam_z += (self.player.z * 0.65 - self.cam_z) * 0.08;
    }
    fn fire_player(&mut self) {
        let angle = self.player.aim_z.atan2(self.player.aim_x);
        let (pellets, spread, speed, damage, cooldown) = match self.weapon {
            1 => (7, 0.42, 31.0, 10.0, 29),
            2 => (1, 0.0, 18.0, 55.0, 44),
            _ => (1, 0.026, 37.0, 14.0, 6),
        };
        self.shot_cd = cooldown;
        self.shots += 1;
        for p in 0..pellets {
            let deviation = if pellets > 1 {
                (p as f32 / (pellets - 1) as f32 - 0.5) * spread
            } else {
                (self.rand() - 0.5) * spread
            };
            let a = angle + deviation;
            self.spawn_bullet(
                0,
                self.weapon,
                self.player.x + a.cos() * 0.72,
                self.player.z + a.sin() * 0.72,
                a.cos() * speed,
                a.sin() * speed,
                damage,
            );
        }
        self.burst(
            self.player.x + self.player.aim_x * 0.7,
            self.player.z + self.player.aim_z * 0.7,
            3,
            5,
            1.4,
        );
    }
    fn damage_player(&mut self, amount: f32) {
        if self.phase != 1 || self.player.hurt_frames > 0 || self.player.dash_frames > 0 {
            return;
        }
        self.player.hp = (self.player.hp - amount).max(0.0);
        self.damage_taken += amount.ceil() as u32;
        self.player.hurt_frames = 30;
        self.burst(self.player.x, self.player.z, 16, 1, 3.0);
        if self.player.hp <= 0.0 {
            self.phase = 4;
            self.end_reason = 1;
        }
    }
    fn update_enemies(&mut self) {
        self.grid.rebuild(&self.enemies);
        for i in 0..self.enemies.len() {
            if self.enemies[i].hp <= 0.0 {
                continue;
            }
            self.enemies[i].flash = self.enemies[i].flash.saturating_sub(1);
            if self.enemies[i].spawn > 0 {
                self.enemies[i].spawn -= 1;
                continue;
            }
            let e = &self.enemies[i];
            let (x, z, kind, id) = (e.x, e.z, e.kind, e.id);
            let (ax, az) = normal(self.player.x - x, self.player.z - z);
            let distance = ((self.player.x - x).powi(2) + (self.player.z - z).powi(2)).sqrt();
            let mut vx = ax;
            let mut vz = az;
            let mut speed = 3.0 + (self.tick as f32 / 5400.0) * 0.7;
            if kind == 1 {
                let radial = if distance > 9.0 {
                    1.0
                } else if distance < 6.0 {
                    -1.0
                } else {
                    0.0
                };
                let side = if id % 2 == 0 { 1.0 } else { -1.0 };
                vx = ax * radial - az * side * 0.65;
                vz = az * radial + ax * side * 0.65;
                speed = 2.3;
            } else if kind == 2 {
                let side = if id % 2 == 0 { 1.0 } else { -1.0 };
                vx = ax * 0.8 - az * side * 0.65;
                vz = az * 0.8 + ax * side * 0.65;
                speed = if (self.tick + id * 19) % 180 < 24 {
                    7.6
                } else {
                    3.5
                };
            } else if kind == 3 {
                let radial = if distance > 6.0 { 0.8 } else { 0.0 };
                vx = ax * radial - az * 0.3;
                vz = az * radial + ax * 0.3;
                speed = if self.tick % 240 >= 215 { 8.5 } else { 1.7 };
            }
            let mut repel_x = 0.0;
            let mut repel_z = 0.0;
            let cx = Grid::cell(x);
            let cz = Grid::cell(z);
            for gz in cz.saturating_sub(1)..=(cz + 1).min(GRID_SIZE - 1) {
                for gx in cx.saturating_sub(1)..=(cx + 1).min(GRID_SIZE - 1) {
                    for &other in &self.grid.cells[gz * GRID_SIZE + gx] {
                        if other == i || self.enemies[other].hp <= 0.0 {
                            continue;
                        }
                        let o = &self.enemies[other];
                        let ddx = x - o.x;
                        let ddz = z - o.z;
                        let minimum = radius(kind) + radius(o.kind) + 0.12;
                        let d2 = ddx * ddx + ddz * ddz;
                        if d2 < minimum * minimum && d2 > 0.0001 {
                            let d = d2.sqrt();
                            repel_x += ddx / d * (minimum - d) * 2.0;
                            repel_z += ddz / d * (minimum - d) * 2.0;
                        }
                    }
                }
            }
            let (nx, nz) = normal(vx, vz);
            let enemy = &mut self.enemies[i];
            enemy.vx = nx * speed + repel_x;
            enemy.vz = nz * speed + repel_z;
            enemy.x += enemy.vx * DT;
            enemy.z += enemy.vz * DT;
            enemy.heading = az.atan2(ax);
            slide(&mut enemy.x, &mut enemy.z, radius(kind), &self.props);
            enemy.attack_tick = enemy.attack_tick.saturating_sub(1);
            let shoot = enemy.attack_tick == 0;
            if shoot {
                enemy.attack_tick = if kind == 3 && enemy.hp < enemy.max_hp * 0.5 {
                    88
                } else if kind == 3 {
                    120
                } else {
                    110
                };
            }
            let (ex, ez, hp, max_hp) = (enemy.x, enemy.z, enemy.hp, enemy.max_hp);
            if distance < radius(kind) + 0.45 {
                self.damage_player(if kind == 3 { 26.0 } else { 12.0 });
            }
            if shoot && kind == 1 {
                self.spawn_bullet(
                    1,
                    3,
                    ex + ax * 0.7,
                    ez + az * 0.7,
                    ax * 10.0,
                    az * 10.0,
                    12.0,
                );
            } else if shoot && kind == 3 {
                let number = if hp < max_hp * 0.5 { 12 } else { 8 };
                let offset = self.tick as f32 * 0.017;
                for n in 0..number {
                    let a = std::f32::consts::TAU * n as f32 / number as f32 + offset;
                    self.spawn_bullet(
                        1,
                        3,
                        ex + a.cos() * 1.5,
                        ez + a.sin() * 1.5,
                        a.cos() * 8.5,
                        a.sin() * 8.5,
                        15.0,
                    );
                }
                for offset in [-0.14, 0.0, 0.14] {
                    let a = az.atan2(ax) + offset;
                    self.spawn_bullet(
                        1,
                        3,
                        ex + a.cos() * 1.5,
                        ez + a.sin() * 1.5,
                        a.cos() * 13.0,
                        a.sin() * 13.0,
                        17.0,
                    );
                }
            }
        }
    }
    fn damage_enemy(&mut self, index: usize, amount: f32) {
        if self.enemies[index].hp <= 0.0 {
            return;
        }
        self.enemies[index].hp -= amount;
        self.enemies[index].flash = 5;
        if self.enemies[index].hp <= 0.0 {
            let (x, z, kind) = (
                self.enemies[index].x,
                self.enemies[index].z,
                self.enemies[index].kind,
            );
            self.kills += 1;
            self.combo = if self.kills > 1 && self.tick.saturating_sub(self.last_kill_tick) <= 120 {
                self.combo + 1
            } else {
                1
            };
            self.last_kill_tick = self.tick;
            self.max_combo = self.max_combo.max(self.combo);
            let base = [100, 150, 180, 2000][kind as usize];
            self.score += base * (1 + (self.combo / 4).min(4));
            self.burst(
                x,
                z,
                if kind == 3 { 96 } else { 22 },
                if kind == 3 { 3 } else { 1 + kind.min(2) },
                if kind == 3 { 8.0 } else { 4.0 },
            );
            if kind == 3 {
                self.boss_dead = true;
                self.phase = 3;
                self.end_reason = 3;
                self.score += (ROUND_FRAMES - self.tick.min(ROUND_FRAMES)) / 6;
            }
        }
    }
    fn damage_prop(&mut self, index: usize, amount: f32) -> bool {
        if self.props[index].hp <= 0.0 {
            return false;
        }
        self.props[index].hp -= amount;
        if self.props[index].hp <= 0.0 {
            self.props_destroyed += 1;
            self.score += 15;
            let (x, z) = (self.props[index].x, self.props[index].z);
            self.burst(x, z, 28, 2, 3.0);
            return true;
        }
        false
    }
    fn explode(&mut self, x: f32, z: f32, damage: f32, r: f32, hostile: bool) {
        let mut pending = vec![(x, z, damage, r, hostile)];
        while let Some((x, z, damage, r, hostile)) = pending.pop() {
            self.explosions += 1;
            self.burst(x, z, 48, 2, 6.0);
            self.burst(x, z, 12, 4, 2.5);
            for i in 0..self.enemies.len() {
                let e = &self.enemies[i];
                let distance = ((e.x - x).powi(2) + (e.z - z).powi(2)).sqrt();
                if e.hp > 0.0 && distance < r + radius(e.kind) {
                    self.damage_enemy(
                        i,
                        damage * (1.0 - distance / (r + radius(self.enemies[i].kind)) * 0.55),
                    );
                }
            }
            for i in 0..self.props.len() {
                let p = &self.props[i];
                let distance = ((p.x - x).powi(2) + (p.z - z).powi(2)).sqrt();
                if p.hp <= 0.0 || distance >= r + p.w.max(p.d) {
                    continue;
                }
                let (px, pz, kind) = (p.x, p.z, p.kind);
                if self.damage_prop(i, damage) && kind == 1 {
                    pending.push((px, pz, 65.0, 3.8, true));
                }
            }
            if hostile && ((self.player.x - x).powi(2) + (self.player.z - z).powi(2)).sqrt() < r {
                self.damage_player(20.0);
            }
        }
    }
    fn update_bullets(&mut self) {
        self.grid.rebuild(&self.enemies);
        for i in 0..self.bullets.len() {
            let mut b = self.bullets[i].clone();
            if b.life == 0 {
                continue;
            }
            b.life -= 1;
            b.px = b.x;
            b.pz = b.z;
            b.x += b.dx * DT;
            b.z += b.dz * DT;
            // Type0prop/1enemy/2player; keep the earliest swept intersection.
            let mut hit: Option<(f32, u32, usize)> = None;
            for (j, p) in self.props.iter().enumerate().filter(|(_, p)| p.hp > 0.0) {
                if let Some(t) = box_hit(b.px, b.pz, b.x, b.z, p, b.radius) {
                    if hit.is_none_or(|h| t < h.0) {
                        hit = Some((t, 0, j));
                    }
                }
            }
            if b.owner == 0 {
                let min_x = Grid::cell(b.px.min(b.x) - 1.5);
                let max_x = Grid::cell(b.px.max(b.x) + 1.5);
                let min_z = Grid::cell(b.pz.min(b.z) - 1.5);
                let max_z = Grid::cell(b.pz.max(b.z) + 1.5);
                for gz in min_z..=max_z {
                    for gx in min_x..=max_x {
                        for &j in &self.grid.cells[gz * GRID_SIZE + gx] {
                            let e = &self.enemies[j];
                            if e.hp <= 0.0 || e.spawn > 0 {
                                continue;
                            }
                            if let Some(t) = circle_hit(
                                b.px,
                                b.pz,
                                b.x,
                                b.z,
                                e.x,
                                e.z,
                                radius(e.kind) + b.radius,
                            ) {
                                if hit.is_none_or(|h| t < h.0) {
                                    hit = Some((t, 1, j));
                                }
                            }
                        }
                    }
                }
            } else if self.player.dash_frames == 0 && self.player.hurt_frames == 0 {
                if let Some(t) = circle_hit(
                    b.px,
                    b.pz,
                    b.x,
                    b.z,
                    self.player.x,
                    self.player.z,
                    0.38 + b.radius,
                ) {
                    if hit.is_none_or(|h| t < h.0) {
                        hit = Some((t, 2, 0));
                    }
                }
            }
            if let Some((t, target, index)) = hit {
                b.x = b.px + (b.x - b.px) * t;
                b.z = b.pz + (b.z - b.pz) * t;
                b.life = 0;
                if b.owner == 0 && b.kind == 2 {
                    self.explode(b.x, b.z, b.damage, 3.3, false);
                } else {
                    match target {
                        0 => {
                            let (px, pz, kind) = (
                                self.props[index].x,
                                self.props[index].z,
                                self.props[index].kind,
                            );
                            if self.damage_prop(index, b.damage) && kind == 1 {
                                self.explode(px, pz, 65.0, 3.8, true);
                            }
                        }
                        1 => self.damage_enemy(index, b.damage),
                        _ => self.damage_player(b.damage),
                    }
                    self.burst(b.x, b.z, 4, if b.owner == 0 { 5 } else { 1 }, 1.8);
                }
            } else if b.x.abs() > 15.0 || b.z.abs() > 15.0 || b.life == 0 {
                b.life = 0;
                if b.kind == 2 && b.owner == 0 {
                    self.explode(b.x, b.z, b.damage, 3.3, false);
                }
            }
            self.bullets[i] = b;
        }
        self.bullets.retain(|b| b.life > 0);
        self.enemies.retain(|e| e.hp > 0.0);
    }
    fn update_particles(&mut self) {
        for p in &mut self.particles {
            p.life = p.life.saturating_sub(1);
            p.x += p.vx * DT;
            p.z += p.vz * DT;
            p.y += p.vy * DT;
            p.vy -= 8.0 * DT;
            if p.y < 0.03 {
                p.y = 0.03;
                p.vy = -p.vy * 0.28;
                p.vx *= 0.86;
                p.vz *= 0.86;
            }
        }
        self.particles.retain(|p| p.life > 0);
    }
    pub fn step(&mut self, frames: u32) {
        for _ in 0..frames.min(6000) {
            if self.phase != 1 {
                break;
            }
            self.tick += 1;
            if self.tick.saturating_sub(self.last_kill_tick) > 120 {
                self.combo = 0;
            }
            self.update_player();
            let interval = (78_u32.saturating_sub(self.tick / 90)).max(23);
            if self.tick % interval == 0 {
                self.spawn_wave();
            }
            if self.tick >= BOSS_FRAME && !self.boss_spawned {
                let x = if self.player.x > 0.0 { -9.0 } else { 9.0 };
                let z = if self.player.z > 0.0 { -9.0 } else { 9.0 };
                self.spawn_enemy(3, x, z, 800.0, 60);
                self.burst(x, z, 80, 3, 6.5);
            }
            self.update_enemies();
            self.update_bullets();
            self.update_particles();
            self.player.dash_frames = self.player.dash_frames.saturating_sub(1);
            if self.phase == 1 && self.tick >= ROUND_FRAMES {
                self.phase = 4;
                self.end_reason = 2;
            }
        }
    }
    pub fn snapshot(&self) -> String {
        let p = &self.player;
        let mut out =
            String::with_capacity(1024 + self.enemies.len() * 90 + self.bullets.len() * 110);
        write!(&mut out,"{{\"phase\":{},\"tick\":{},\"timeLeft\":{:.4},\"score\":{},\"kills\":{},\"combo\":{},\"maxCombo\":{},\"weapon\":{},\"bossSpawned\":{},\"bossDead\":{},\"shots\":{},\"explosions\":{},\"propsDestroyed\":{},\"damageTaken\":{},\"dashes\":{},\"camX\":{:.4},\"camZ\":{:.4},\"reason\":{},\"player\":{{\"x\":{:.4},\"z\":{:.4},\"hp\":{:.4},\"aimX\":{:.4},\"aimZ\":{:.4},\"dashFrames\":{},\"dashCd\":{},\"hurtFrames\":{}}},\"enemies\":[",self.phase,self.tick,(ROUND_FRAMES.saturating_sub(self.tick)) as f32/60.0,self.score,self.kills,self.combo,self.max_combo,self.weapon,self.boss_spawned,self.boss_dead,self.shots,self.explosions,self.props_destroyed,self.damage_taken,self.dashes,self.cam_x,self.cam_z,self.end_reason,p.x,p.z,p.hp,p.aim_x,p.aim_z,p.dash_frames,p.dash_cd,p.hurt_frames).unwrap();
        for (i, e) in self.enemies.iter().enumerate() {
            if i > 0 {
                out.push(',');
            }
            write!(
                &mut out,
                "{{\"id\":{},\"kind\":{},\"x\":{:.4},\"z\":{:.4},\"hp\":{:.4},\"maxHp\":{:.4}}}",
                e.id, e.kind, e.x, e.z, e.hp, e.max_hp
            )
            .unwrap();
        }
        out.push_str("],\"bullets\":[");
        for (i, b) in self.bullets.iter().enumerate() {
            if i > 0 {
                out.push(',');
            }
            write!(&mut out,"{{\"x\":{:.4},\"z\":{:.4},\"dx\":{:.4},\"dz\":{:.4},\"kind\":{},\"owner\":{},\"damage\":{:.4},\"life\":{}}}",b.x,b.z,b.dx,b.dz,b.kind,b.owner,b.damage,b.life).unwrap();
        }
        out.push_str("],\"props\":[");
        for (i, p) in self.props.iter().enumerate() {
            if i > 0 {
                out.push(',');
            }
            write!(&mut out,"{{\"x\":{:.4},\"z\":{:.4},\"w\":{:.4},\"d\":{:.4},\"h\":{:.4},\"hp\":{:.4},\"maxHp\":{:.4},\"kind\":{}}}",p.x,p.z,p.w,p.d,p.h,p.hp,p.max_hp,p.kind).unwrap();
        }
        write!(&mut out, "],\"particleCount\":{}}}", self.particles.len()).unwrap();
        out
    }
    fn scene(&mut self) {
        *self = Self::new(2026);
        self.phase = 1;
        self.tick = 2100;
        self.score = 1420;
        self.kills = 12;
        self.combo = 4;
        self.max_combo = 6;
        self.weapon = 1;
        self.player.hp = 72.0;
        self.player.x = 0.0;
        self.player.z = 0.0;
        self.player.aim_x = 0.96;
        self.player.aim_z = -0.28;
        for (kind, x, z, hp) in [
            (0, 4.0, 0.0, 34.0),
            (0, -3.0, -1.0, 20.0),
            (0, 1.8, 4.0, 34.0),
            (1, 6.5, -2.0, 48.0),
            (1, -5.0, 1.0, 48.0),
            (2, 2.0, -5.0, 42.0),
            (2, -2.0, 5.0, 42.0),
        ] {
            self.spawn_enemy(kind, x, z, hp, 0);
        }
        self.spawn_bullet(0, 0, 2.0, -0.58, 35.0, -10.0, 14.0);
        self.spawn_bullet(0, 0, 3.1, -0.9, 35.0, -10.0, 14.0);
        self.spawn_bullet(1, 3, -2.0, -1.5, 5.0, 7.0, 12.0);
        self.spawn_bullet(1, 3, 4.0, -2.0, -8.0, 2.0, 12.0);
        self.burst(3.8, 0.0, 18, 1, 3.2);
        self.burst(-4.5, 4.5, 16, 2, 3.5);
        for (i, p) in self.particles.iter_mut().enumerate() {
            let amount = (i % 11) as f32 * 0.09;
            p.x += p.vx * amount;
            p.z += p.vz * amount;
            p.y = (p.y + p.vy * amount).max(0.1);
        }
    }
}

// This module is a single-threaded wasm32 engine, not a shared-memory worker.
static mut GAME: Option<Game> = None;
static mut HUD: [f32; 32] = [0.0; 32];
static mut SNAPSHOT: Vec<u8> = Vec::new();
pub fn game() -> &'static mut Game {
    // Own the engine directly in stable static storage. There is no nullable
    // heap pointer or transferred Box ownership to validate on each call.
    // Exports run synchronously on one browser thread with no host imports.
    unsafe {
        let slot = &mut *std::ptr::addr_of_mut!(GAME);
        slot.get_or_insert_with(|| Game::new(1))
    }
}
#[no_mangle]
pub extern "C" fn engine_version() -> u32 {
    1
}
#[no_mangle]
pub extern "C" fn reset(seed: u32) {
    *game() = Game::new(seed);
}
#[no_mangle]
pub extern "C" fn start(seed: u32) {
    reset(seed);
    game().start();
}
#[no_mangle]
pub extern "C" fn set_paused(value: u32) {
    let g = game();
    if value != 0 && g.phase == 1 {
        g.phase = 2;
    } else if value == 0 && g.phase == 2 {
        g.phase = 1;
    }
}
#[no_mangle]
pub extern "C" fn step(frames: u32) {
    game().step(frames);
}
#[no_mangle]
pub extern "C" fn input(
    mx: f32,
    my: f32,
    nx: f32,
    ny: f32,
    fire: u32,
    dash: u32,
    weapon: u32,
    autoaim: u32,
    aspect: f32,
) {
    game().set_control(
        mx,
        my,
        nx,
        ny,
        fire != 0,
        dash != 0,
        weapon,
        autoaim != 0,
        aspect,
    );
}
#[no_mangle]
pub extern "C" fn input_keyboard(
    mx: f32,
    my: f32,
    ax: f32,
    ay: f32,
    fire: u32,
    dash: u32,
    weapon: u32,
    autoaim: u32,
    aspect: f32,
) {
    game().set_keyboard_control(
        mx,
        my,
        ax,
        ay,
        fire != 0,
        dash != 0,
        weapon,
        autoaim != 0,
        aspect,
    );
}
#[no_mangle]
pub extern "C" fn input_turn(
    mx: f32,
    my: f32,
    turn: f32,
    fine: u32,
    fire: u32,
    dash: u32,
    weapon: u32,
    autoaim: u32,
    aspect: f32,
) {
    game().set_turn_control(
        mx,
        my,
        turn,
        fine != 0,
        fire != 0,
        dash != 0,
        weapon,
        autoaim != 0,
        aspect,
    );
}
#[no_mangle]
pub extern "C" fn hud_ptr() -> *const f32 {
    let g = game();
    let p = &g.player;
    let boss = g.enemies.iter().find(|e| e.kind == 3 && e.hp > 0.0);
    let values = [
        g.phase as f32,
        g.tick as f32,
        ROUND_FRAMES.saturating_sub(g.tick) as f32 / 60.0,
        g.score as f32,
        g.kills as f32,
        g.combo as f32,
        g.max_combo as f32,
        p.x,
        p.z,
        p.hp,
        p.dash_cd as f32,
        p.dash_frames as f32,
        g.weapon as f32,
        g.enemies.len() as f32,
        g.bullets.len() as f32,
        g.particles.len() as f32,
        boss.map_or(0.0, |e| e.hp),
        boss.map_or(0.0, |e| e.max_hp),
        if boss.is_some() { 1.0 } else { 0.0 },
        if g.boss_dead { 1.0 } else { 0.0 },
        g.shots as f32,
        g.explosions as f32,
        g.props_destroyed as f32,
        g.damage_taken as f32,
        g.dashes as f32,
        p.aim_x,
        p.aim_z,
        g.cam_x,
        g.cam_z,
        0.0,
        0.0,
        0.0,
    ];
    unsafe {
        HUD = values;
        std::ptr::addr_of!(HUD) as *const f32
    }
}
#[no_mangle]
pub extern "C" fn snapshot_ptr() -> *const u8 {
    unsafe {
        SNAPSHOT = game().snapshot().into_bytes();
        (&*std::ptr::addr_of!(SNAPSHOT)).as_ptr()
    }
}
#[no_mangle]
pub extern "C" fn snapshot_len() -> usize {
    unsafe { (&*std::ptr::addr_of!(SNAPSHOT)).len() }
}
#[no_mangle]
pub extern "C" fn test_set_tick(tick: u32) {
    game().tick = tick.min(ROUND_FRAMES);
}
#[no_mangle]
pub extern "C" fn test_set_player(x: f32, z: f32, hp: f32) {
    let p = &mut game().player;
    p.x = finite(x).clamp(-LIMIT, LIMIT);
    p.z = finite(z).clamp(-LIMIT, LIMIT);
    p.hp = finite(hp).clamp(0.0, 100.0);
    p.hurt_frames = 0;
    p.dash_frames = 0;
    p.dash_cd = 0;
}
#[no_mangle]
pub extern "C" fn test_clear_enemies() {
    game().enemies.clear();
}
#[no_mangle]
pub extern "C" fn test_clear_bullets() {
    game().bullets.clear();
}
#[no_mangle]
pub extern "C" fn test_clear_props() {
    game().props.clear();
}
#[no_mangle]
pub extern "C" fn test_spawn_enemy(kind: u32, x: f32, z: f32, hp: f32) -> u32 {
    game().spawn_enemy(kind, x, z, hp, 0)
}
#[no_mangle]
pub extern "C" fn test_spawn_bullet(
    owner: u32,
    kind: u32,
    x: f32,
    z: f32,
    dx: f32,
    dz: f32,
    damage: f32,
) {
    game().spawn_bullet(owner, kind, x, z, dx, dz, damage);
}
#[no_mangle]
pub extern "C" fn test_set_weapon(weapon: u32) {
    game().weapon = weapon.min(2);
    game().shot_cd = 0;
}
#[no_mangle]
pub extern "C" fn test_scene() {
    game().scene();
}
#[no_mangle]
pub extern "C" fn test_stress(count: u32) {
    let g = game();
    g.enemies.clear();
    g.bullets.clear();
    g.particles.clear();
    for i in 0..count.min(1200) {
        let a = i as f32 * 2.399963;
        let r = 3.0 + (i % 100) as f32 * 0.09;
        g.spawn_enemy(i % 3, a.cos() * r, a.sin() * r, 42.0, 0);
        if i % 2 == 0 {
            g.spawn_bullet(
                0,
                0,
                a.cos() * r,
                a.sin() * r,
                a.sin() * 4.0,
                a.cos() * 4.0,
                1.0,
            );
        }
    }
    g.burst(0.0, 0.0, (count * 3).min(4096) as usize, 2, 5.0);
}

#[cfg(test)]
mod tests {
    use super::*;
    fn active() -> Game {
        let mut g = Game::new(7);
        g.start();
        g.props.clear();
        g
    }
    fn controls(g: &mut Game, mx: f32, my: f32, fire: bool, dash: bool, weapon: u32) {
        g.set_control(mx, my, 0.8, 0.0, fire, dash, weapon, true, 1.8);
    }
    #[test]
    fn seed_and_frame_stepping_are_deterministic() {
        let mut a = active();
        let mut b = active();
        controls(&mut a, 1.0, 0.0, true, false, 0);
        controls(&mut b, 1.0, 0.0, true, false, 0);
        a.step(420);
        for _ in 0..42 {
            b.step(10);
        }
        assert_eq!(a.snapshot(), b.snapshot());
    }
    #[test]
    fn idle_ready_and_paused_states_do_not_advance() {
        let mut g = Game::new(1);
        g.step(200);
        assert_eq!(g.tick, 0);
        g.start();
        g.step(1);
        g.phase = 2;
        let before = g.snapshot();
        g.step(300);
        assert_eq!(g.snapshot(), before);
    }
    #[test]
    fn movement_is_screen_relative_and_diagonals_are_normalized() {
        let mut a = active();
        let mut b = active();
        controls(&mut a, 1.0, 0.0, false, false, 0);
        controls(&mut b, 1.0, 1.0, false, false, 0);
        a.step(30);
        b.step(30);
        assert!(a.player.x > 0.0 && a.player.z < 0.0);
        assert!(
            ((a.player.x * a.player.x + a.player.z * a.player.z).sqrt()
                - (b.player.x * b.player.x + b.player.z * b.player.z).sqrt())
            .abs()
                < 0.001
        );
    }
    #[test]
    fn dash_consumes_one_request_and_grants_invulnerability() {
        let mut g = active();
        controls(&mut g, 1.0, 0.0, false, true, 0);
        g.spawn_bullet(1, 3, 0.4, -0.4, 0.0, 0.0, 100.0);
        g.step(1);
        assert_eq!(g.dashes, 1);
        assert!(g.player.dash_frames > 0);
        assert_eq!(g.player.hp, 100.0);
        g.step(10);
        assert_eq!(g.dashes, 1);
        assert!(g.player.x > 2.0);
    }
    #[test]
    fn three_weapons_have_distinct_projectile_patterns() {
        for (weapon, count) in [(0, 1), (1, 7), (2, 1)] {
            let mut g = active();
            controls(&mut g, 0.0, 0.0, true, false, weapon);
            g.step(1);
            assert_eq!(g.bullets.len(), count);
            assert_eq!(g.bullets[0].kind, weapon);
            assert_eq!(g.shots, 1);
        }
    }
    #[test]
    fn swept_projectile_hits_enemy_even_when_crossing_it_in_one_step() {
        let mut g = active();
        g.spawn_enemy(0, 2.0, 0.0, 10.0, 0);
        g.spawn_bullet(0, 0, 0.0, 0.0, 240.0, 0.0, 14.0);
        g.step(1);
        assert_eq!(g.kills, 1);
        assert!(g.enemies.is_empty());
        assert!(g.score >= 100);
    }
    #[test]
    fn cover_blocks_projectiles_and_can_be_destroyed() {
        let mut g = active();
        g.props.push(Prop {
            x: 1.5,
            z: 0.0,
            w: 0.4,
            d: 0.8,
            h: 1.0,
            hp: 20.0,
            max_hp: 20.0,
            kind: 0,
        });
        g.spawn_enemy(0, 3.0, 0.0, 50.0, 0);
        g.spawn_bullet(0, 0, 0.0, 0.0, 240.0, 0.0, 25.0);
        g.step(1);
        assert_eq!(g.props_destroyed, 1);
        assert_eq!(g.enemies[0].hp, 50.0);
    }
    #[test]
    fn barrels_chain_and_damage_nearby_enemies() {
        let mut g = active();
        for x in [2.0, 4.0] {
            g.props.push(Prop {
                x,
                z: 0.0,
                w: 0.4,
                d: 0.4,
                h: 1.0,
                hp: 15.0,
                max_hp: 15.0,
                kind: 1,
            });
        }
        g.spawn_enemy(0, 5.0, 0.0, 20.0, 0);
        g.spawn_bullet(0, 0, 0.0, 0.0, 180.0, 0.0, 20.0);
        g.step(1);
        assert_eq!(g.props_destroyed, 2);
        assert!(g.explosions >= 2);
        assert_eq!(g.kills, 1);
    }
    #[test]
    fn launcher_splash_can_hit_more_than_one_target() {
        let mut g = active();
        g.spawn_enemy(0, 3.0, 0.0, 25.0, 0);
        g.spawn_enemy(0, 3.0, 1.5, 25.0, 0);
        g.spawn_bullet(0, 2, 0.0, 0.0, 240.0, 0.0, 55.0);
        g.step(1);
        assert_eq!(g.kills, 2);
        assert_eq!(g.explosions, 1);
    }
    #[test]
    fn taking_lethal_damage_ends_the_round() {
        let mut g = active();
        g.player.hp = 10.0;
        g.spawn_bullet(1, 3, 0.0, 0.0, 0.0, 0.0, 12.0);
        g.step(1);
        assert_eq!(g.phase, 4);
        assert_eq!(g.player.hp, 0.0);
        assert_eq!(g.end_reason, 1);
    }
    #[test]
    fn combo_chains_then_expires() {
        let mut g = active();
        for x in [1.0, 3.0] {
            let id = g.spawn_enemy(0, x, 0.0, 1.0, 0);
            let index = g.enemies.iter().position(|e| e.id == id).unwrap();
            g.damage_enemy(index, 2.0);
        }
        assert_eq!(g.combo, 2);
        g.enemies.clear();
        g.step(121);
        assert_eq!(g.combo, 0);
        assert_eq!(g.max_combo, 2);
    }
    #[test]
    fn boss_appears_at_sixty_seconds_and_killing_it_wins() {
        let mut g = active();
        g.tick = BOSS_FRAME - 1;
        g.step(1);
        let boss = g.enemies.iter().position(|e| e.kind == 3).unwrap();
        assert!(g.boss_spawned);
        g.damage_enemy(boss, 1000.0);
        assert_eq!(g.phase, 3);
        assert!(g.boss_dead);
    }
    #[test]
    fn ninety_second_deadline_is_a_loss_with_living_boss() {
        let mut g = active();
        g.tick = ROUND_FRAMES - 1;
        g.step(1);
        assert_eq!(g.phase, 4);
        assert_eq!(g.end_reason, 2);
        assert_eq!(g.tick, ROUND_FRAMES);
    }
    #[test]
    fn enemy_types_move_and_ranged_enemies_fire() {
        let mut g = active();
        for (kind, x, z) in [(0, 8.0, 0.0), (1, 0.0, 8.0), (2, -8.0, 0.0)] {
            g.spawn_enemy(kind, x, z, 0.0, 0);
        }
        for e in &mut g.enemies {
            e.attack_tick = 1;
        }
        let positions: Vec<_> = g.enemies.iter().map(|e| (e.x, e.z)).collect();
        g.step(1);
        assert!(g.bullets.iter().any(|b| b.owner == 1));
        for (e, old) in g.enemies.iter().zip(positions) {
            assert_ne!((e.x, e.z), old);
        }
    }
    #[test]
    fn arena_boundaries_and_cover_are_solid() {
        let mut g = active();
        g.player.x = 13.5;
        controls(&mut g, 1.0, 1.0, false, true, 0);
        g.step(20);
        assert!(g.player.x <= 13.62);
        let mut h = Game::new(1);
        h.phase = 1;
        h.player.x = 5.0;
        h.player.z = 2.0;
        controls(&mut h, -1.0, 1.0, false, false, 0);
        h.step(30);
        assert!(h.player.z < 3.0);
    }
    #[test]
    fn keyboard_aim_projects_to_all_eight_screen_directions() {
        for (ax, ay) in [
            (1.0, 0.0),
            (-1.0, 0.0),
            (0.0, -1.0),
            (0.0, 1.0),
            (1.0, -1.0),
            (-1.0, -1.0),
            (1.0, 1.0),
            (-1.0, 1.0),
        ] {
            let mut g = active();
            g.set_keyboard_control(0.0, 0.0, ax, ay, false, false, 0, false, 1.8);
            g.step(1);
            let screen_x = (g.player.aim_x - g.player.aim_z) * 0.8660254;
            let screen_y = (g.player.aim_x + g.player.aim_z) * 0.5;
            let actual = normal(screen_x, screen_y);
            let expected = normal(ax, ay);
            assert!(
                (actual.0 - expected.0).abs() < 0.0001,
                "screen x for ({ax},{ay})"
            );
            assert!(
                (actual.1 - expected.1).abs() < 0.0001,
                "screen y for ({ax},{ay})"
            );
        }
    }
    #[test]
    fn releasing_arrow_keys_retains_facing_while_moving_and_firing() {
        let mut g = active();
        g.set_keyboard_control(0.0, 0.0, 0.0, -1.0, false, false, 0, false, 1.8);
        g.step(1);
        let facing = (g.player.aim_x, g.player.aim_z);
        g.set_keyboard_control(1.0, 0.0, 0.0, 0.0, true, false, 0, false, 1.8);
        g.step(10);
        assert!((g.player.x - g.player.z) > 1.0);
        assert_eq!((g.player.aim_x, g.player.aim_z), facing);
        assert!(g.shots >= 2);
        for bullet in &g.bullets {
            let direction = normal(bullet.dx, bullet.dz);
            assert!(direction.0 * facing.0 + direction.1 * facing.1 > 0.999);
        }
    }
    #[test]
    fn keyboard_aim_ignores_camera_position_and_aspect() {
        let mut g = active();
        g.player.x = 8.0;
        g.player.z = -3.0;
        g.cam_x = 5.0;
        g.cam_z = -2.0;
        g.set_keyboard_control(0.0, 0.0, 1.0, 0.0, false, false, 0, false, 0.45);
        g.step(1);
        assert!((g.player.aim_x - std::f32::consts::FRAC_1_SQRT_2).abs() < 0.0001);
        assert!((g.player.aim_z + std::f32::consts::FRAC_1_SQRT_2).abs() < 0.0001);
    }
    #[test]
    fn touch_autoaim_has_priority_over_keyboard_direction() {
        let mut g = active();
        g.spawn_enemy(0, -4.0, -4.0, 34.0, 0);
        g.set_keyboard_control(0.0, 0.0, 1.0, 0.0, true, false, 0, true, 1.8);
        g.step(1);
        assert!(g.player.aim_x < 0.0 && g.player.aim_z < 0.0);
        assert_eq!(g.shots, 1);
    }
    fn screen_heading(g: &Game) -> f32 {
        let sx = (g.player.aim_x - g.player.aim_z) * 0.8660254;
        let sy = (g.player.aim_x + g.player.aim_z) * 0.5;
        sy.atan2(sx)
    }
    fn angle_distance(a: f32, b: f32) -> f32 {
        ((a - b + std::f32::consts::PI).rem_euclid(std::f32::consts::TAU) - std::f32::consts::PI)
            .abs()
    }
    #[test]
    fn continuous_turn_reaches_arbitrary_angle_after_seven_frames() {
        let mut g = active();
        g.set_turn_control(0.0, 0.0, 1.0, false, false, false, 0, false, 1.8);
        g.step(7);
        assert!(angle_distance(screen_heading(&g), 17.5_f32.to_radians()) < 0.0001);
        let nearest_eighth = (screen_heading(&g) / (std::f32::consts::PI / 4.0)).round()
            * (std::f32::consts::PI / 4.0);
        assert!(angle_distance(screen_heading(&g), nearest_eighth) > 0.2);
        assert!(
            (g.player.aim_x * g.player.aim_x + g.player.aim_z * g.player.aim_z - 1.0).abs()
                < 0.0001
        );
    }
    #[test]
    fn continuous_turn_has_more_than_eight_distinct_directions() {
        let mut g = active();
        g.set_turn_control(0.0, 0.0, 1.0, false, false, false, 0, false, 1.8);
        let mut headings = Vec::new();
        for _ in 0..24 {
            g.step(1);
            let heading = screen_heading(&g);
            assert!(headings
                .iter()
                .all(|previous| angle_distance(heading, *previous) > 0.03));
            headings.push(heading);
        }
        assert_eq!(headings.len(), 24);
    }
    #[test]
    fn fine_turning_uses_forty_five_degrees_per_second() {
        let mut normal = active();
        let mut fine = active();
        normal.set_turn_control(0.0, 0.0, 1.0, false, false, false, 0, false, 1.8);
        fine.set_turn_control(0.0, 0.0, 1.0, true, false, false, 0, false, 1.8);
        normal.step(12);
        fine.step(12);
        assert!(angle_distance(screen_heading(&normal), 30.0_f32.to_radians()) < 0.0001);
        assert!(angle_distance(screen_heading(&fine), 9.0_f32.to_radians()) < 0.0001);
        assert!((screen_heading(&normal) / screen_heading(&fine) - 150.0 / 45.0).abs() < 0.001);
    }
    #[test]
    fn continuous_turn_wraps_full_circle_and_reverses_direction() {
        let mut g = active();
        g.set_turn_control(0.0, 0.0, 1.0, false, false, false, 0, false, 1.8);
        g.step(144);
        assert!(angle_distance(screen_heading(&g), 0.0) < 0.0001);
        g.set_turn_control(0.0, 0.0, -1.0, false, false, false, 0, false, 1.8);
        g.step(7);
        assert!(angle_distance(screen_heading(&g), (-17.5_f32).to_radians()) < 0.0001);
    }
    #[test]
    fn released_continuous_turn_retains_heading_during_independent_move_and_fire() {
        let mut g = active();
        g.set_turn_control(0.0, 0.0, 1.0, false, false, false, 0, false, 1.8);
        g.step(7);
        let facing = (g.player.aim_x, g.player.aim_z);
        g.set_turn_control(1.0, 0.0, 0.0, false, true, false, 0, false, 0.5);
        g.step(10);
        assert_eq!((g.player.aim_x, g.player.aim_z), facing);
        assert!(g.player.x > 0.7 && g.player.z < -0.7);
        assert!(g.shots >= 2);
        for bullet in &g.bullets {
            let direction = normal(bullet.dx, bullet.dz);
            assert!(direction.0 * facing.0 + direction.1 * facing.1 > 0.999);
        }
    }
    #[test]
    fn touch_autoaim_has_priority_over_continuous_turn() {
        let mut g = active();
        g.spawn_enemy(0, -4.0, -4.0, 34.0, 0);
        g.set_turn_control(0.0, 0.0, 1.0, false, true, false, 0, true, 1.8);
        g.step(1);
        assert!(g.player.aim_x < 0.0 && g.player.aim_z < 0.0);
        assert_eq!(g.shots, 1);
    }
    #[test]
    fn legacy_aim_modes_clear_continuous_turn_flags() {
        let mut g = active();
        g.set_turn_control(0.0, 0.0, 1.0, false, false, false, 0, false, 1.8);
        g.step(7);
        g.set_keyboard_control(0.0, 0.0, -1.0, 0.0, false, false, 0, false, 1.8);
        g.step(1);
        assert!(angle_distance(screen_heading(&g), std::f32::consts::PI) < 0.0001);
        assert!(!g.control.continuous_aim && g.control.keyboard_aim);
        g.set_turn_control(0.0, 0.0, 0.0, false, false, false, 0, false, 1.8);
        assert!(g.control.continuous_aim && !g.control.keyboard_aim);
        g.set_control(0.0, 0.0, 1.0, 0.0, false, false, 0, false, 1.8);
        assert!(!g.control.continuous_aim && !g.control.keyboard_aim);
    }
}
