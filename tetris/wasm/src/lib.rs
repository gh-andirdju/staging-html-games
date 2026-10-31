//! Deterministic Tetris rules. The browser supplies a board through linear memory;
//! all collision, SRS, drop, clearing and scoring decisions run in this module.
mod renderer;

const MAX_COLS: usize = 64;
const MAX_ROWS: usize = 64;
const MAX_CELLS: usize = MAX_COLS * MAX_ROWS;
type Shape = [[i32; 2]; 4];

const SHAPES: [[Shape; 4]; 7] = [
    [
        [[-1, 0], [0, 0], [1, 0], [2, 0]],
        [[1, -1], [1, 0], [1, 1], [1, 2]],
        [[-1, 1], [0, 1], [1, 1], [2, 1]],
        [[0, -1], [0, 0], [0, 1], [0, 2]],
    ],
    [
        [[0, 0], [1, 0], [0, 1], [1, 1]],
        [[0, 0], [1, 0], [0, 1], [1, 1]],
        [[0, 0], [1, 0], [0, 1], [1, 1]],
        [[0, 0], [1, 0], [0, 1], [1, 1]],
    ],
    [
        [[0, -1], [-1, 0], [0, 0], [1, 0]],
        [[0, -1], [0, 0], [1, 0], [0, 1]],
        [[-1, 0], [0, 0], [1, 0], [0, 1]],
        [[0, -1], [-1, 0], [0, 0], [0, 1]],
    ],
    [
        [[0, -1], [1, -1], [-1, 0], [0, 0]],
        [[0, -1], [0, 0], [1, 0], [1, 1]],
        [[0, 0], [1, 0], [-1, 1], [0, 1]],
        [[-1, -1], [-1, 0], [0, 0], [0, 1]],
    ],
    [
        [[-1, -1], [0, -1], [0, 0], [1, 0]],
        [[1, -1], [0, 0], [1, 0], [0, 1]],
        [[-1, 0], [0, 0], [0, 1], [1, 1]],
        [[0, -1], [-1, 0], [0, 0], [-1, 1]],
    ],
    [
        [[-1, -1], [-1, 0], [0, 0], [1, 0]],
        [[0, -1], [1, -1], [0, 0], [0, 1]],
        [[-1, 0], [0, 0], [1, 0], [1, 1]],
        [[0, -1], [0, 0], [-1, 1], [0, 1]],
    ],
    [
        [[1, -1], [-1, 0], [0, 0], [1, 0]],
        [[0, -1], [0, 0], [0, 1], [1, 1]],
        [[-1, 0], [0, 0], [1, 0], [-1, 1]],
        [[-1, -1], [0, -1], [0, 0], [0, 1]],
    ],
];

fn kicks_i(from: i32, to: i32) -> &'static [[i32; 2]; 5] {
    match (from.rem_euclid(4), to.rem_euclid(4)) {
        (0, 1) => &[[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
        (1, 0) => &[[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
        (1, 2) => &[[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
        (2, 1) => &[[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
        (2, 3) => &[[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
        (3, 2) => &[[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
        (3, 0) => &[[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
        (0, 3) => &[[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
        _ => &[[0, 0]; 5],
    }
}

fn kicks_jlstz(from: i32, to: i32) -> &'static [[i32; 2]; 5] {
    match (from.rem_euclid(4), to.rem_euclid(4)) {
        (0, 1) => &[[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
        (1, 0) => &[[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
        (1, 2) => &[[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
        (2, 1) => &[[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
        (2, 3) => &[[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
        (3, 2) => &[[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
        (3, 0) => &[[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
        (0, 3) => &[[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
        _ => &[[0, 0]; 5],
    }
}

struct Engine {
    cols: usize,
    rows: usize,
    board: [u8; MAX_CELLS],
    selected_rows: [u8; MAX_ROWS],
    output: [i32; 8],
}

impl Engine {
    const fn new() -> Self {
        Self {
            cols: 10,
            rows: 20,
            board: [0; MAX_CELLS],
            selected_rows: [0; MAX_ROWS],
            output: [0; 8],
        }
    }

    fn shape(kind: i32, rotation: i32) -> Option<&'static Shape> {
        if !(1..=7).contains(&kind) {
            return None;
        }
        Some(&SHAPES[(kind - 1) as usize][rotation.rem_euclid(4) as usize])
    }

    fn valid(&self, kind: i32, rotation: i32, x: i32, y: i32) -> bool {
        let Some(shape) = Self::shape(kind, rotation) else {
            return false;
        };
        shape.iter().all(|[dx, dy]| {
            let (cx, cy) = (x + dx, y + dy);
            cx >= 0
                && cx < self.cols as i32
                && cy < self.rows as i32
                && (cy < 0 || self.board[cy as usize * self.cols + cx as usize] == 0)
        })
    }

    fn drop_distance(&self, kind: i32, rotation: i32, x: i32, y: i32) -> i32 {
        if Self::shape(kind, rotation).is_none() {
            return 0;
        }
        let mut distance = 0;
        while distance < self.rows as i32 + 4 && self.valid(kind, rotation, x, y + distance + 1) {
            distance += 1;
        }
        distance
    }

    fn merge(&mut self, kind: i32, rotation: i32, x: i32, y: i32, color: u8) {
        let Some(shape) = Self::shape(kind, rotation) else {
            return;
        };
        for [dx, dy] in shape {
            let (cx, cy) = (x + dx, y + dy);
            if cx >= 0 && cx < self.cols as i32 && cy >= 0 && cy < self.rows as i32 {
                self.board[cy as usize * self.cols + cx as usize] = color;
            }
        }
    }

    fn rotate(&mut self, kind: i32, from: i32, to: i32, x: i32, y: i32) -> i32 {
        let zero = [[0, 0]; 5];
        let kicks = if kind == 2 {
            &zero
        } else if kind == 1 {
            kicks_i(from, to)
        } else {
            kicks_jlstz(from, to)
        };
        for (kick, [dx, dy]) in kicks.iter().enumerate() {
            if self.valid(kind, to, x + dx, y + dy) {
                self.output[0] = x + dx;
                self.output[1] = y + dy;
                return kick as i32;
            }
            if kind == 2 {
                break;
            }
        }
        -1
    }

    fn full_rows(&mut self) -> i32 {
        self.selected_rows.fill(0);
        let mut count = 0;
        for row in 0..self.rows {
            if self.board[row * self.cols..(row + 1) * self.cols]
                .iter()
                .all(|&v| v != 0)
            {
                self.selected_rows[row] = 1;
                count += 1;
            }
        }
        count
    }

    fn collapse(&mut self) {
        let mut target = self.rows;
        for row in (0..self.rows).rev() {
            if self.selected_rows[row] == 0 {
                target -= 1;
                self.board
                    .copy_within(row * self.cols..(row + 1) * self.cols, target * self.cols);
            }
        }
        self.board[..target * self.cols].fill(0);
    }

    fn clear_would_empty(&self) -> bool {
        (0..self.rows).all(|row| {
            self.selected_rows[row] != 0
                || self.board[row * self.cols..(row + 1) * self.cols]
                    .iter()
                    .all(|&v| v == 0)
        })
    }

    fn corner(&self, x: i32, y: i32) -> bool {
        if x < 0 || x >= self.cols as i32 || y >= self.rows as i32 {
            return true;
        }
        y >= 0 && self.board[y as usize * self.cols + x as usize] != 0
    }

    fn t_spin(
        &self,
        kind: i32,
        rotation: i32,
        x: i32,
        y: i32,
        last_rotation: bool,
        last_kick: i32,
    ) -> i32 {
        if kind != 3 || !last_rotation {
            return 0;
        }
        let [tl, tr, bl, br] = [
            self.corner(x - 1, y - 1),
            self.corner(x + 1, y - 1),
            self.corner(x - 1, y + 1),
            self.corner(x + 1, y + 1),
        ];
        if [tl, tr, bl, br].iter().filter(|&&v| v).count() < 3 {
            return 0;
        }
        let (a, b) = match rotation.rem_euclid(4) {
            0 => (tl, tr),
            1 => (tr, br),
            2 => (bl, br),
            _ => (tl, bl),
        };
        if (a && b) || last_kick >= 4 {
            2
        } else {
            1
        }
    }
}

// One instance per WebAssembly instantiation; calls are synchronous and the
// browser bridge never retains Rust references across a subsequent call.
static mut ENGINE: Engine = Engine::new();
fn engine() -> &'static mut Engine {
    unsafe { &mut *std::ptr::addr_of_mut!(ENGINE) }
}

#[no_mangle]
pub extern "C" fn engine_version() -> i32 {
    1
}
#[no_mangle]
pub extern "C" fn board_ptr() -> *mut u8 {
    engine().board.as_mut_ptr()
}
#[no_mangle]
pub extern "C" fn rows_ptr() -> *mut u8 {
    engine().selected_rows.as_mut_ptr()
}
#[no_mangle]
pub extern "C" fn output_ptr() -> *mut i32 {
    engine().output.as_mut_ptr()
}
#[no_mangle]
pub extern "C" fn configure(cols: i32, rows: i32) -> i32 {
    if cols < 1 || cols as usize > MAX_COLS || rows < 1 || rows as usize > MAX_ROWS {
        return 0;
    }
    let e = engine();
    e.cols = cols as usize;
    e.rows = rows as usize;
    1
}
#[no_mangle]
pub extern "C" fn piece_cells(kind: i32, rotation: i32, x: i32, y: i32) -> i32 {
    let Some(shape) = Engine::shape(kind, rotation) else {
        return 0;
    };
    let e = engine();
    for (i, [dx, dy]) in shape.iter().enumerate() {
        e.output[2 * i] = x + dx;
        e.output[2 * i + 1] = y + dy;
    }
    4
}
#[no_mangle]
pub extern "C" fn is_valid(kind: i32, rotation: i32, x: i32, y: i32) -> i32 {
    engine().valid(kind, rotation, x, y) as i32
}
#[no_mangle]
pub extern "C" fn merge_piece(kind: i32, rotation: i32, x: i32, y: i32, color: i32) {
    engine().merge(kind, rotation, x, y, color as u8);
}
#[no_mangle]
pub extern "C" fn rotate_piece(kind: i32, from: i32, to: i32, x: i32, y: i32) -> i32 {
    engine().rotate(kind, from, to, x, y)
}
#[no_mangle]
pub extern "C" fn drop_distance(kind: i32, rotation: i32, x: i32, y: i32) -> i32 {
    engine().drop_distance(kind, rotation, x, y)
}
#[no_mangle]
pub extern "C" fn full_rows() -> i32 {
    engine().full_rows()
}
#[no_mangle]
pub extern "C" fn collapse_rows() {
    engine().collapse();
}
#[no_mangle]
pub extern "C" fn clear_would_empty() -> i32 {
    engine().clear_would_empty() as i32
}
#[no_mangle]
pub extern "C" fn detect_t_spin(
    kind: i32,
    rotation: i32,
    x: i32,
    y: i32,
    last_rotation: i32,
    last_kick: i32,
) -> i32 {
    engine().t_spin(kind, rotation, x, y, last_rotation != 0, last_kick)
}
#[no_mangle]
pub extern "C" fn clear_score(
    cleared: i32,
    spin: i32,
    level: i32,
    combo: i32,
    back_to_back: i32,
    perfect: i32,
) -> i32 {
    if !(0..=4).contains(&cleared) {
        return 0;
    }
    let row = cleared as usize;
    let base = match spin {
        1 => [100, 200, 400, 400, 0][row],
        2 => [400, 800, 1200, 1600, 0][row],
        _ => [0, 100, 300, 500, 800][row],
    };
    let mut points = base * level;
    if back_to_back != 0 {
        points += base / 2 * level;
    }
    if combo > 0 {
        points += 50 * combo * level;
    }
    if perfect != 0 {
        points += [0, 800, 1200, 1800, 2000][row] * level;
    }
    points
}
#[no_mangle]
pub extern "C" fn gravity_frames(level: i32) -> i32 {
    [48, 44, 40, 34, 30, 27, 24, 21, 18, 16, 14, 12, 10, 8, 6][level.clamp(1, 15) as usize - 1]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collision_respects_walls_floor_and_open_ceiling() {
        let e = Engine::new();
        assert!(!e.valid(1, 0, 0, 2));
        assert!(e.valid(3, 0, 4, 0));
        assert!(!e.valid(2, 0, 4, 19));
        assert_eq!(e.drop_distance(2, 0, 4, 1), 17);
    }

    #[test]
    fn rotation_uses_srs_wall_kicks() {
        let mut e = Engine::new();
        assert_eq!(e.rotate(3, 1, 2, 0, 3), 1);
        assert_eq!(&e.output[..2], &[1, 3]);
        assert_eq!(e.rotate(1, 1, 2, -1, 3), 2);
        assert_eq!(&e.output[..2], &[1, 3]);
    }

    #[test]
    fn merge_clear_and_collapse_preserve_other_rows() {
        let mut e = Engine::new();
        e.board[190..200].fill(1);
        e.board[180] = 7;
        assert_eq!(e.full_rows(), 1);
        assert!(!e.clear_would_empty());
        e.collapse();
        assert_eq!(e.board[190], 7);
        assert_eq!(e.board.iter().filter(|&&v| v != 0).count(), 1);
        e.merge(2, 0, 4, 18, 2);
        assert_eq!(e.board[184], 2);
        assert!(!e.valid(2, 0, 4, 18));
    }

    #[test]
    fn t_spin_front_corners_distinguish_full_and_mini() {
        let mut e = Engine::new();
        for index in [22, 24, 42] {
            e.board[index] = 1;
        }
        assert_eq!(e.t_spin(3, 0, 3, 3, true, 0), 2);
        assert_eq!(e.t_spin(3, 1, 3, 3, true, 0), 1);
        assert_eq!(e.t_spin(3, 1, 3, 3, true, 4), 2);
        assert_eq!(e.t_spin(3, 0, 3, 3, false, 0), 0);
    }

    #[test]
    fn scoring_combines_level_combo_back_to_back_and_perfect_clear() {
        assert_eq!(clear_score(4, 0, 2, 2, 1, 1), (800 + 400 + 100 + 2000) * 2);
        assert_eq!(clear_score(0, 1, 3, 0, 0, 0), 300);
        assert_eq!(clear_score(2, 2, 1, 0, 0, 0), 1200);
        assert_eq!(gravity_frames(100), 6);
    }
}
