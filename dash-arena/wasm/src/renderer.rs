//! Procedural isometric meshes. Rust owns projection, geometry, color and lighting;
//! the browser uploads this packed buffer once and submits one triangle draw.
use super::{game, Enemy, Game};
use std::f32::consts::{PI, TAU};

const STRIDE: usize = 7;
const MAX_VERTICES: usize = 300_000;
const VIEW_HEIGHT: f32 = 24.0;
const ISO_X: f32 = 0.866_025_4;
type Color = [f32; 4];
type Point = [f32; 3];
const CYAN: Color = [0.20, 0.88, 0.96, 1.0];
const CORAL: Color = [1.0, 0.29, 0.35, 1.0];
const AMBER: Color = [1.0, 0.67, 0.20, 1.0];
const VIOLET: Color = [0.63, 0.40, 1.0, 1.0];
const WHITE: Color = [0.89, 0.98, 1.0, 1.0];
const MAGENTA: Color = [1.0, 0.20, 0.58, 1.0];

struct Mesh {
    vertices: Vec<f32>,
    aspect: f32,
    cam_x: f32,
    cam_z: f32,
}

impl Mesh {
    fn new() -> Self {
        Self {
            vertices: Vec::with_capacity(80_000 * STRIDE),
            aspect: 1.0,
            cam_x: 0.0,
            cam_z: 0.0,
        }
    }
    fn begin(&mut self, aspect: f32, cam_x: f32, cam_z: f32) {
        self.vertices.clear();
        self.aspect = if aspect.is_finite() {
            aspect.clamp(0.25, 5.0)
        } else {
            1.0
        };
        self.cam_x = cam_x;
        self.cam_z = cam_z;
    }
    fn project(&self, point: Point) -> Point {
        let x = point[0] - self.cam_x;
        let z = point[2] - self.cam_z;
        [
            2.0 * (x - z) * ISO_X / (VIEW_HEIGHT * self.aspect),
            -2.0 * ((x + z) * 0.5 - point[1] * 1.2) / VIEW_HEIGHT,
            -((x + z) * 0.5 + point[1] * 0.7) / 50.0,
        ]
    }
    fn triangle_clip(&mut self, a: Point, b: Point, c: Point, color: Color) {
        if self.vertices.len() / STRIDE + 3 > MAX_VERTICES {
            return;
        }
        for point in [a, b, c] {
            self.vertices.extend_from_slice(&point);
            self.vertices.extend_from_slice(&color);
        }
    }
    fn triangle(&mut self, a: Point, b: Point, c: Point, color: Color) {
        self.triangle_clip(self.project(a), self.project(b), self.project(c), color);
    }
    fn quad(&mut self, points: [Point; 4], color: Color) {
        self.triangle(points[0], points[1], points[2], color);
        self.triangle(points[0], points[2], points[3], color);
    }
    fn ground(&mut self, x: f32, z: f32, w: f32, d: f32, y: f32, color: Color) {
        self.quad(
            [
                [x - w, y, z - d],
                [x + w, y, z - d],
                [x + w, y, z + d],
                [x - w, y, z + d],
            ],
            color,
        );
    }
    fn box_yaw(&mut self, center: Point, half: Point, yaw: f32, color: Color) {
        let (s, c) = yaw.sin_cos();
        let mut corners = [[0.0; 3]; 8];
        for (i, (x, y, z)) in [
            (-1.0, -1.0, -1.0),
            (1.0, -1.0, -1.0),
            (1.0, -1.0, 1.0),
            (-1.0, -1.0, 1.0),
            (-1.0, 1.0, -1.0),
            (1.0, 1.0, -1.0),
            (1.0, 1.0, 1.0),
            (-1.0, 1.0, 1.0),
        ]
        .into_iter()
        .enumerate()
        {
            corners[i] = [
                center[0] + x * half[0] * c - z * half[2] * s,
                center[1] + y * half[1],
                center[2] + x * half[0] * s + z * half[2] * c,
            ];
        }
        // Fixed face normals receive one directional light plus ambient fill.
        for (ids, normal) in [
            ([4, 5, 6, 7], [0.0, 1.0, 0.0]),
            ([0, 3, 2, 1], [0.0, -1.0, 0.0]),
            ([0, 1, 5, 4], [s, 0.0, -c]),
            ([3, 7, 6, 2], [-s, 0.0, c]),
            ([1, 2, 6, 5], [c, 0.0, s]),
            ([0, 4, 7, 3], [-c, 0.0, -s]),
        ] {
            let light =
                (0.58 + normal[0] * -0.20 + normal[1] * 0.40 + normal[2] * -0.14).clamp(0.30, 1.12);
            self.quad(
                [
                    corners[ids[0]],
                    corners[ids[1]],
                    corners[ids[2]],
                    corners[ids[3]],
                ],
                tint(color, light),
            );
        }
    }
    fn cuboid(&mut self, center: Point, half: Point, color: Color) {
        self.box_yaw(center, half, 0.0, color);
    }
    fn disc(&mut self, x: f32, y: f32, z: f32, radius: f32, color: Color, segments: usize) {
        for i in 0..segments {
            let a = i as f32 * TAU / segments as f32;
            let b = (i + 1) as f32 * TAU / segments as f32;
            self.triangle(
                [x, y, z],
                [x + a.cos() * radius, y, z + a.sin() * radius],
                [x + b.cos() * radius, y, z + b.sin() * radius],
                color,
            );
        }
    }
    fn ring(
        &mut self,
        x: f32,
        y: f32,
        z: f32,
        radius: f32,
        width: f32,
        color: Color,
        segments: usize,
    ) {
        let inner = (radius - width).max(0.0);
        for i in 0..segments {
            let a = i as f32 * TAU / segments as f32;
            let b = (i + 1) as f32 * TAU / segments as f32;
            self.quad(
                [
                    [x + a.cos() * inner, y, z + a.sin() * inner],
                    [x + a.cos() * radius, y, z + a.sin() * radius],
                    [x + b.cos() * radius, y, z + b.sin() * radius],
                    [x + b.cos() * inner, y, z + b.sin() * inner],
                ],
                color,
            );
        }
    }
    fn cylinder(
        &mut self,
        x: f32,
        z: f32,
        bottom: f32,
        radius: f32,
        height: f32,
        color: Color,
        segments: usize,
    ) {
        self.disc(x, bottom + height, z, radius, tint(color, 1.08), segments);
        for i in 0..segments {
            let a = i as f32 * TAU / segments as f32;
            let b = (i + 1) as f32 * TAU / segments as f32;
            let light = 0.67 - a.cos() * 0.16 - a.sin() * 0.12;
            self.quad(
                [
                    [x + a.cos() * radius, bottom, z + a.sin() * radius],
                    [x + b.cos() * radius, bottom, z + b.sin() * radius],
                    [x + b.cos() * radius, bottom + height, z + b.sin() * radius],
                    [x + a.cos() * radius, bottom + height, z + a.sin() * radius],
                ],
                tint(color, light),
            );
        }
    }
    fn octahedron(&mut self, center: Point, radius: f32, height: f32, color: Color, yaw: f32) {
        let top = [center[0], center[1] + height, center[2]];
        let bottom = [center[0], center[1] - height, center[2]];
        for i in 0..4 {
            let a = yaw + i as f32 * PI * 0.5;
            let b = a + PI * 0.5;
            let p = [
                center[0] + a.cos() * radius,
                center[1],
                center[2] + a.sin() * radius,
            ];
            let q = [
                center[0] + b.cos() * radius,
                center[1],
                center[2] + b.sin() * radius,
            ];
            self.triangle(
                top,
                p,
                q,
                tint(color, 0.78 + a.cos() * 0.12 + a.sin() * 0.08),
            );
            self.triangle(bottom, q, p, tint(color, 0.40 + a.cos() * 0.10));
        }
    }
    fn line(&mut self, a: Point, b: Point, width: f32, color: Color) {
        let dx = b[0] - a[0];
        let dz = b[2] - a[2];
        let length = (dx * dx + dz * dz).sqrt().max(0.0001);
        let ox = -dz / length * width;
        let oz = dx / length * width;
        self.quad(
            [
                [a[0] + ox, a[1], a[2] + oz],
                [b[0] + ox, b[1], b[2] + oz],
                [b[0] - ox, b[1], b[2] - oz],
                [a[0] - ox, a[1], a[2] - oz],
            ],
            color,
        );
    }
    fn billboard(&mut self, center: Point, width: f32, height: f32, color: Color) {
        let p = self.project(center);
        let x = width / (VIEW_HEIGHT * self.aspect);
        let y = height / VIEW_HEIGHT;
        self.triangle_clip(
            [p[0] - x, p[1] - y, p[2] - 0.003],
            [p[0] + x, p[1] - y, p[2] - 0.003],
            [p[0] + x, p[1] + y, p[2] - 0.003],
            color,
        );
        self.triangle_clip(
            [p[0] - x, p[1] - y, p[2] - 0.003],
            [p[0] + x, p[1] + y, p[2] - 0.003],
            [p[0] - x, p[1] + y, p[2] - 0.003],
            color,
        );
    }
    fn health_bar(&mut self, x: f32, z: f32, y: f32, fraction: f32, width: f32, color: Color) {
        self.billboard([x, y, z], width + 0.08, 0.15, [0.025, 0.035, 0.055, 1.0]);
        let p = self.project([x, y, z]);
        let full = width / (VIEW_HEIGHT * self.aspect);
        let half_h = 0.075 / VIEW_HEIGHT;
        let end = p[0] - full + 2.0 * full * fraction.clamp(0.0, 1.0);
        let depth = p[2] - 0.004;
        self.triangle_clip(
            [p[0] - full, p[1] - half_h, depth],
            [end, p[1] - half_h, depth],
            [end, p[1] + half_h, depth],
            color,
        );
        self.triangle_clip(
            [p[0] - full, p[1] - half_h, depth],
            [end, p[1] + half_h, depth],
            [p[0] - full, p[1] + half_h, depth],
            color,
        );
    }
}

fn tint(color: Color, amount: f32) -> Color {
    [
        (color[0] * amount).min(1.0),
        (color[1] * amount).min(1.0),
        (color[2] * amount).min(1.0),
        color[3],
    ]
}
fn point_offset(x: f32, z: f32, forward: f32, side: f32, yaw: f32) -> [f32; 2] {
    let (s, c) = yaw.sin_cos();
    [x + forward * c - side * s, z + forward * s + side * c]
}

fn arena(mesh: &mut Mesh) {
    mesh.cuboid(
        [0.0, -0.57, 0.0],
        [15.25, 0.5, 15.25],
        [0.035, 0.052, 0.086, 1.0],
    );
    mesh.cuboid(
        [0.0, -0.20, 0.0],
        [15.05, 0.12, 15.05],
        [0.10, 0.18, 0.25, 1.0],
    );
    for ix in -7..=7 {
        for iz in -7..=7 {
            let x = ix as f32 * 2.0;
            let z = iz as f32 * 2.0;
            let fade = (1.0 - (x * x + z * z) / 950.0).clamp(0.58, 1.0);
            let base = if (ix + iz) % 2 == 0 {
                [0.075, 0.113, 0.160, 1.0]
            } else {
                [0.064, 0.099, 0.145, 1.0]
            };
            mesh.ground(x, z, 0.974, 0.974, 0.002, tint(base, fade));
            if ix % 3 == 0 && iz % 3 == 0 {
                mesh.ground(
                    x + 0.86,
                    z + 0.86,
                    0.045,
                    0.045,
                    0.008,
                    [0.15, 0.23, 0.29, 1.0],
                );
            }
        }
    }
    // Painted central landing pad and subtle navigation markings.
    mesh.ring(0.0, 0.012, 0.0, 3.9, 0.035, [0.11, 0.20, 0.26, 1.0], 48);
    mesh.ring(0.0, 0.012, 0.0, 4.1, 0.022, [0.08, 0.16, 0.23, 1.0], 48);
    mesh.ground(0.0, 0.0, 0.035, 0.65, 0.014, [0.13, 0.25, 0.30, 1.0]);
    mesh.ground(0.0, 0.0, 0.65, 0.035, 0.014, [0.13, 0.25, 0.30, 1.0]);
    for side in [-1.0, 1.0] {
        mesh.cuboid(
            [side * 14.9, 0.12, 0.0],
            [0.12, 0.18, 14.9],
            [0.075, 0.14, 0.20, 1.0],
        );
        mesh.cuboid(
            [0.0, 0.12, side * 14.9],
            [14.9, 0.18, 0.12],
            [0.075, 0.14, 0.20, 1.0],
        );
        mesh.cuboid(
            [side * 14.88, 0.31, 0.0],
            [0.025, 0.015, 14.9],
            [0.12, 0.42, 0.48, 1.0],
        );
        mesh.cuboid(
            [0.0, 0.31, side * 14.88],
            [14.9, 0.015, 0.025],
            [0.12, 0.42, 0.48, 1.0],
        );
        for n in -3..=3 {
            let d = n as f32 * 3.8;
            mesh.ground(side * 14.4, d, 0.18, 0.45, 0.02, [0.26, 0.32, 0.32, 1.0]);
            mesh.ground(d, side * 14.4, 0.45, 0.18, 0.02, [0.26, 0.32, 0.32, 1.0]);
        }
    }
    for x in [-14.65, 14.65] {
        for z in [-14.65, 14.65] {
            mesh.cuboid([x, 0.65, z], [0.42, 0.72, 0.42], [0.08, 0.14, 0.21, 1.0]);
            mesh.cuboid([x, 1.38, z], [0.46, 0.07, 0.46], [0.15, 0.27, 0.34, 1.0]);
            mesh.cuboid([x, 1.48, z], [0.23, 0.04, 0.23], CYAN);
        }
    }
}

fn props(mesh: &mut Mesh, g: &Game) {
    for prop in &g.props {
        if prop.hp <= 0.0 {
            mesh.ground(
                prop.x,
                prop.z,
                prop.w * 0.8,
                prop.d * 0.8,
                0.017,
                [0.035, 0.055, 0.075, 1.0],
            );
            mesh.cuboid(
                [prop.x + prop.w * 0.4, 0.10, prop.z - prop.d * 0.3],
                [prop.w * 0.30, 0.10, prop.d * 0.20],
                [0.10, 0.13, 0.16, 1.0],
            );
            continue;
        }
        mesh.disc(
            prop.x,
            0.015,
            prop.z,
            prop.w.max(prop.d) * 1.25,
            [0.025, 0.04, 0.061, 1.0],
            12,
        );
        if prop.kind == 1 {
            let radius = prop.w.max(prop.d) * 0.92;
            mesh.cylinder(
                prop.x,
                prop.z,
                0.03,
                radius,
                prop.h,
                [0.66, 0.22, 0.11, 1.0],
                10,
            );
            mesh.cylinder(
                prop.x,
                prop.z,
                prop.h * 0.27,
                radius * 1.025,
                prop.h * 0.18,
                [0.13, 0.11, 0.12, 1.0],
                10,
            );
            mesh.cylinder(
                prop.x,
                prop.z,
                prop.h * 0.83,
                radius * 1.025,
                prop.h * 0.10,
                [0.16, 0.14, 0.14, 1.0],
                10,
            );
            mesh.disc(prop.x, prop.h + 0.012, prop.z, radius * 0.65, AMBER, 10);
            mesh.octahedron(
                [prop.x, prop.h + 0.10, prop.z],
                0.15,
                0.10,
                [1.0, 0.85, 0.37, 1.0],
                0.0,
            );
        } else {
            let damage = if prop.max_hp > 0.0 {
                prop.hp / prop.max_hp
            } else {
                1.0
            };
            let body = tint([0.25, 0.34, 0.40, 1.0], 0.7 + damage * 0.3);
            mesh.cuboid(
                [prop.x, prop.h * 0.5, prop.z],
                [prop.w, prop.h * 0.5, prop.d],
                body,
            );
            mesh.cuboid(
                [prop.x, prop.h + 0.045, prop.z],
                [prop.w + 0.025, 0.045, prop.d + 0.025],
                [0.42, 0.50, 0.52, 1.0],
            );
            mesh.cuboid(
                [prop.x, prop.h * 0.5, prop.z + prop.d + 0.012],
                [prop.w * 0.72, prop.h * 0.17, 0.016],
                [0.095, 0.14, 0.18, 1.0],
            );
            for side in [-1.0, 1.0] {
                mesh.cuboid(
                    [prop.x + side * prop.w * 0.75, prop.h + 0.10, prop.z],
                    [0.07, 0.028, prop.d * 0.75],
                    AMBER,
                );
            }
            if damage < 0.55 {
                mesh.line(
                    [prop.x - prop.w * 0.7, prop.h + 0.098, prop.z - prop.d * 0.6],
                    [prop.x + prop.w * 0.6, prop.h + 0.098, prop.z + prop.d * 0.4],
                    0.035,
                    [0.06, 0.085, 0.11, 1.0],
                );
            }
        }
    }
}

fn player(mesh: &mut Mesh, g: &Game) {
    let p = &g.player;
    let yaw = p.aim_z.atan2(p.aim_x);
    let speed = (p.vx * p.vx + p.vz * p.vz).sqrt();
    let gait = (g.tick as f32 * 0.32).sin() * if speed > 0.5 { 0.12 } else { 0.0 };
    mesh.disc(p.x, 0.019, p.z, 0.73, [0.023, 0.042, 0.063, 1.0], 16);
    mesh.ring(p.x, 0.025, p.z, 0.68, 0.055, [0.08, 0.42, 0.49, 1.0], 20);
    if p.dash_frames > 0 {
        for i in (1..=4).rev() {
            let length = (p.vx * p.vx + p.vz * p.vz).sqrt().max(0.01);
            let behind = i as f32 * 0.45;
            let x = p.x - p.vx / length * behind;
            let z = p.z - p.vz / length * behind;
            mesh.box_yaw(
                [x, 0.66, z],
                [0.29, 0.40, 0.25],
                yaw,
                tint(CYAN, 0.18 + (4 - i) as f32 * 0.08),
            );
        }
        mesh.ring(p.x, 0.027, p.z, 0.95, 0.07, CYAN, 24);
    }
    for (side, step) in [(-1.0, gait), (1.0, -gait)] {
        let foot = point_offset(p.x, p.z, step, side * 0.18, yaw);
        mesh.box_yaw(
            [foot[0], 0.18, foot[1]],
            [0.22, 0.18, 0.11],
            yaw,
            [0.08, 0.17, 0.23, 1.0],
        );
    }
    let base = if p.hurt_frames > 0 && p.hurt_frames % 6 < 3 {
        WHITE
    } else {
        CYAN
    };
    mesh.box_yaw([p.x, 0.72, p.z], [0.33, 0.36, 0.28], yaw, tint(base, 0.78));
    mesh.box_yaw([p.x, 1.21, p.z], [0.25, 0.23, 0.25], yaw, base);
    let face = point_offset(p.x, p.z, 0.255, 0.0, yaw);
    mesh.box_yaw(
        [face[0], 1.24, face[1]],
        [0.025, 0.065, 0.19],
        yaw,
        [0.80, 0.99, 1.0, 1.0],
    );
    let backpack = point_offset(p.x, p.z, -0.34, 0.0, yaw);
    mesh.box_yaw(
        [backpack[0], 0.77, backpack[1]],
        [0.08, 0.25, 0.21],
        yaw,
        [0.07, 0.22, 0.31, 1.0],
    );
    for side in [-1.0, 1.0] {
        let shoulder = point_offset(p.x, p.z, 0.08, side * 0.37, yaw);
        mesh.box_yaw(
            [shoulder[0], 0.88, shoulder[1]],
            [0.23, 0.14, 0.11],
            yaw,
            tint(base, 0.68),
        );
    }
    let gun = point_offset(p.x, p.z, 0.62, 0.0, yaw);
    let gun_color = match g.weapon {
        1 => AMBER,
        2 => VIOLET,
        _ => CYAN,
    };
    let barrel_width = match g.weapon {
        1 => 0.16,
        2 => 0.19,
        _ => 0.085,
    };
    mesh.box_yaw(
        [gun[0], 0.82, gun[1]],
        [0.41, 0.11, barrel_width],
        yaw,
        [0.13, 0.19, 0.25, 1.0],
    );
    mesh.box_yaw(
        [gun[0], 0.94, gun[1]],
        [0.20, 0.025, barrel_width * 0.7],
        yaw,
        gun_color,
    );
    let flash = g.shot_cd
        >= match g.weapon {
            1 => 28,
            2 => 46,
            _ => 4,
        };
    if flash {
        let muzzle = point_offset(p.x, p.z, 1.10, 0.0, yaw);
        mesh.octahedron(
            [muzzle[0], 0.82, muzzle[1]],
            0.24,
            0.19,
            [1.0, 0.92, 0.65, 1.0],
            yaw + g.tick as f32,
        );
    }
    // Dotted guide makes the weapon's aim unambiguous even without a cursor.
    for i in 0..5 {
        let distance = 1.5 + i as f32 * 0.65;
        mesh.disc(
            p.x + p.aim_x * distance,
            0.021,
            p.z + p.aim_z * distance,
            0.025,
            [0.12, 0.35, 0.41, 1.0],
            5,
        );
    }
    let tx = p.x + p.aim_x * 7.0;
    let tz = p.z + p.aim_z * 7.0;
    mesh.ring(tx, 0.023, tz, 0.25, 0.035, [0.21, 0.67, 0.73, 1.0], 16);
}

fn enemy(mesh: &mut Mesh, g: &Game, e: &Enemy) {
    if e.hp <= 0.0 {
        return;
    }
    let size = if e.kind == 3 { 2.15 } else { 0.70 };
    let base = if e.flash > 0 {
        WHITE
    } else {
        match e.kind {
            1 => AMBER,
            2 => VIOLET,
            3 => MAGENTA,
            _ => CORAL,
        }
    };
    mesh.disc(
        e.x,
        0.018,
        e.z,
        size,
        [0.025, 0.035, 0.055, 1.0],
        if e.kind == 3 { 24 } else { 12 },
    );
    if e.spawn > 0 {
        mesh.ring(
            e.x,
            0.027,
            e.z,
            size * 1.4 + (e.spawn % 15) as f32 * 0.018,
            0.065,
            tint(base, 0.70),
            24,
        );
    }
    if (e.kind == 1 || e.kind == 3) && e.attack_tick <= 20 && e.spawn == 0 {
        let charge = 1.0 - e.attack_tick as f32 / 20.0;
        mesh.ring(
            e.x,
            0.026,
            e.z,
            size + 0.35 + charge * 0.50,
            0.05 + charge * 0.03,
            tint(base, 0.65 + charge * 0.30),
            32,
        );
        let dx = g.player.x - e.x;
        let dz = g.player.z - e.z;
        let length = (dx * dx + dz * dz).sqrt().max(0.01);
        for i in 0..5 {
            let start = 1.0 + i as f32 * 0.65;
            mesh.line(
                [e.x + dx / length * start, 0.023, e.z + dz / length * start],
                [
                    e.x + dx / length * (start + 0.35),
                    0.023,
                    e.z + dz / length * (start + 0.35),
                ],
                0.025,
                tint(base, 0.5 + charge * 0.3),
            );
        }
    }
    match e.kind {
        1 => {
            mesh.cylinder(e.x, e.z, 0.06, 0.47, 0.32, [0.10, 0.13, 0.18, 1.0], 8);
            mesh.box_yaw([e.x, 0.66, e.z], [0.38, 0.31, 0.34], e.heading, base);
            mesh.box_yaw(
                [e.x, 1.05, e.z],
                [0.25, 0.08, 0.25],
                e.heading,
                [0.12, 0.17, 0.21, 1.0],
            );
            let gun = point_offset(e.x, e.z, 0.59, 0.0, e.heading);
            mesh.box_yaw(
                [gun[0], 0.77, gun[1]],
                [0.37, 0.08, 0.10],
                e.heading,
                [0.11, 0.15, 0.20, 1.0],
            );
            let tip = point_offset(e.x, e.z, 0.96, 0.0, e.heading);
            mesh.box_yaw(
                [tip[0], 0.77, tip[1]],
                [0.025, 0.065, 0.075],
                e.heading,
                tint(AMBER, 1.2),
            );
        }
        2 => {
            let bob = (g.tick as f32 * 0.11 + e.id as f32).sin() * 0.10;
            mesh.octahedron([e.x, 0.92 + bob, e.z], 0.56, 0.48, base, e.heading);
            for side in [-1.0, 1.0] {
                let wing = point_offset(e.x, e.z, -0.18, side * 0.52, e.heading);
                mesh.box_yaw(
                    [wing[0], 0.67 + bob, wing[1]],
                    [0.44, 0.055, 0.13],
                    e.heading + side * 0.20,
                    tint(base, 0.70),
                );
            }
            mesh.octahedron(
                [e.x, 0.97 + bob, e.z],
                0.18,
                0.17,
                [0.91, 0.78, 1.0, 1.0],
                e.heading,
            );
        }
        3 => {
            for side in [-1.0, 1.0] {
                for front in [-1.0, 1.0] {
                    let leg = point_offset(e.x, e.z, front * 0.85, side * 1.22, e.heading);
                    mesh.box_yaw(
                        [leg[0], 0.39, leg[1]],
                        [0.58, 0.35, 0.25],
                        e.heading + front * side * 0.22,
                        [0.17, 0.11, 0.20, 1.0],
                    );
                    mesh.box_yaw(
                        [leg[0], 0.12, leg[1]],
                        [0.66, 0.10, 0.34],
                        e.heading,
                        tint(base, 0.42),
                    );
                }
            }
            mesh.box_yaw(
                [e.x, 1.27, e.z],
                [1.0, 0.61, 0.83],
                e.heading,
                tint(base, 0.75),
            );
            mesh.box_yaw([e.x, 1.98, e.z], [0.69, 0.18, 0.58], e.heading, base);
            let eye = point_offset(e.x, e.z, 1.015, 0.0, e.heading);
            mesh.box_yaw(
                [eye[0], 1.52, eye[1]],
                [0.05, 0.15, 0.57],
                e.heading,
                [1.0, 0.78, 0.52, 1.0],
            );
            for side in [-1.0, 1.0] {
                let cannon = point_offset(e.x, e.z, 0.70, side * 0.91, e.heading);
                mesh.box_yaw(
                    [cannon[0], 1.47, cannon[1]],
                    [0.83, 0.18, 0.22],
                    e.heading,
                    [0.10, 0.10, 0.16, 1.0],
                );
                let tip = point_offset(e.x, e.z, 1.54, side * 0.91, e.heading);
                mesh.box_yaw([tip[0], 1.47, tip[1]], [0.04, 0.13, 0.17], e.heading, base);
            }
        }
        _ => {
            for side in [-1.0, 1.0] {
                let foot = point_offset(e.x, e.z, -0.05, side * 0.42, e.heading);
                mesh.box_yaw(
                    [foot[0], 0.20, foot[1]],
                    [0.32, 0.15, 0.10],
                    e.heading,
                    [0.14, 0.11, 0.14, 1.0],
                );
            }
            mesh.box_yaw(
                [e.x, 0.63, e.z],
                [0.37, 0.30, 0.31],
                e.heading,
                tint(base, 0.87),
            );
            mesh.octahedron([e.x, 1.05, e.z], 0.40, 0.25, base, e.heading);
            let face = point_offset(e.x, e.z, 0.39, 0.0, e.heading);
            mesh.box_yaw(
                [face[0], 0.80, face[1]],
                [0.025, 0.055, 0.22],
                e.heading,
                [1.0, 0.78, 0.70, 1.0],
            );
        }
    }
    if e.hp < e.max_hp || e.kind == 3 {
        mesh.health_bar(
            e.x,
            e.z,
            if e.kind == 3 { 2.65 } else { 1.53 },
            e.hp / e.max_hp.max(1.0),
            if e.kind == 3 { 3.0 } else { 0.85 },
            base,
        );
    }
}

fn effects(mesh: &mut Mesh, g: &Game) {
    for bullet in &g.bullets {
        let color = if bullet.owner == 1 {
            CORAL
        } else {
            match bullet.kind {
                1 => AMBER,
                2 => VIOLET,
                _ => CYAN,
            }
        };
        let speed = (bullet.dx * bullet.dx + bullet.dz * bullet.dz)
            .sqrt()
            .max(0.01);
        let tail = if bullet.kind == 2 { 0.8 } else { 0.42 };
        mesh.line(
            [
                bullet.x - bullet.dx / speed * tail,
                bullet.y,
                bullet.z - bullet.dz / speed * tail,
            ],
            [bullet.x, bullet.y, bullet.z],
            if bullet.kind == 2 { 0.075 } else { 0.035 },
            tint(color, 0.75),
        );
        if bullet.kind == 2 && bullet.owner == 0 {
            let yaw = bullet.dz.atan2(bullet.dx);
            mesh.box_yaw(
                [bullet.x, bullet.y, bullet.z],
                [0.20, 0.09, 0.09],
                yaw,
                [0.78, 0.77, 0.94, 1.0],
            );
            mesh.octahedron(
                [
                    bullet.x - bullet.dx / speed * 0.25,
                    bullet.y,
                    bullet.z - bullet.dz / speed * 0.25,
                ],
                0.13,
                0.09,
                AMBER,
                yaw,
            );
        } else {
            mesh.octahedron(
                [bullet.x, bullet.y, bullet.z],
                if bullet.owner == 1 { 0.13 } else { 0.08 },
                0.085,
                tint(color, 1.2),
                0.0,
            );
        }
    }
    for (i, particle) in g.particles.iter().enumerate() {
        if particle.life == 0 {
            continue;
        }
        let ratio = particle.life as f32 / particle.max_life.max(1) as f32;
        let color = match particle.kind {
            1 => CORAL,
            2 => AMBER,
            3 => VIOLET,
            4 => [0.16, 0.20, 0.25, 1.0],
            5 => WHITE,
            _ => CYAN,
        };
        let size = particle.size * (0.45 + ratio * 0.55);
        let point = [particle.x, particle.y.max(0.025), particle.z];
        if i % 4 == 0 && particle.kind != 4 {
            mesh.octahedron(
                point,
                size,
                size * 0.5,
                tint(color, 0.45 + ratio * 0.70),
                g.tick as f32 * 0.08 + i as f32,
            );
        } else {
            mesh.billboard(
                point,
                size * 1.5,
                size * 1.5,
                tint(color, 0.3 + ratio * 0.7),
            );
        }
    }
}

fn build_scene(mesh: &mut Mesh, g: &Game) {
    arena(mesh);
    props(mesh, g);
    for e in &g.enemies {
        enemy(mesh, g, e);
    }
    player(mesh, g);
    effects(mesh, g);
}

static mut MESH: Option<Mesh> = None;
fn output_mesh() -> &'static mut Mesh {
    // The browser Wasm module has one thread and exports are invoked synchronously.
    unsafe {
        let slot = &mut *std::ptr::addr_of_mut!(MESH);
        slot.get_or_insert_with(Mesh::new)
    }
}

#[no_mangle]
pub extern "C" fn render(aspect: f32) -> u32 {
    let g = game();
    let mesh = output_mesh();
    mesh.begin(aspect, g.cam_x, g.cam_z);
    build_scene(mesh, g);
    (mesh.vertices.len() / STRIDE) as u32
}

#[no_mangle]
pub extern "C" fn vertices_ptr() -> *const f32 {
    output_mesh().vertices.as_ptr()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn projection_respects_isometric_axes_height_and_aspect() {
        let mut mesh = Mesh::new();
        mesh.begin(2.0, 0.0, 0.0);
        let origin = mesh.project([0.0, 0.0, 0.0]);
        let east = mesh.project([1.0, 0.0, 0.0]);
        let north = mesh.project([0.0, 0.0, 1.0]);
        let high = mesh.project([0.0, 1.0, 0.0]);
        assert_eq!(origin, [0.0, 0.0, -0.0]);
        assert!(east[0] > 0.0 && north[0] < 0.0);
        assert!((east[1] - north[1]).abs() < 1e-6);
        assert!(high[1] > origin[1] && high[2] < origin[2]);
        let x = east[0];
        mesh.begin(1.0, 0.0, 0.0);
        assert!((mesh.project([1.0, 0.0, 0.0])[0] - 2.0 * x).abs() < 1e-6);
    }
    #[test]
    fn procedural_mesh_has_complete_finite_colored_triangles() {
        let mut mesh = Mesh::new();
        mesh.begin(1.6, 2.0, -3.0);
        arena(&mut mesh);
        mesh.box_yaw([2.0, 1.0, -3.0], [0.5, 1.0, 0.3], 0.7, CYAN);
        mesh.octahedron([1.0, 1.0, -2.0], 0.6, 0.4, CORAL, 0.2);
        mesh.cylinder(2.0, 4.0, 0.0, 0.5, 1.0, AMBER, 10);
        mesh.health_bar(1.0, 2.0, 3.0, 0.5, 1.0, CYAN);
        assert_eq!(mesh.vertices.len() % (STRIDE * 3), 0);
        assert!(mesh.vertices.len() > 10_000);
        assert!(mesh.vertices.iter().all(|v| v.is_finite()));
        for vertex in mesh.vertices.chunks_exact(STRIDE) {
            assert!(vertex[3..].iter().all(|v| *v >= 0.0 && *v <= 1.0));
        }
    }
    #[test]
    fn vertex_budget_stops_on_triangle_boundaries() {
        let mut mesh = Mesh::new();
        for _ in 0..MAX_VERTICES / 3 + 5 {
            mesh.triangle([0.0; 3], [1.0; 3], [2.0; 3], WHITE);
        }
        assert_eq!(mesh.vertices.len(), MAX_VERTICES * STRIDE);
    }
}
