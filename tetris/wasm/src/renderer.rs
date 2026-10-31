//! Canvas2D drawing instructions and geometry are authored in Rust. The import
//! only forwards individual browser-native operations to the active context.
use super::{engine, Engine};

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "canvas2d")]
extern "C" {
    fn call(op: u32, a: f64, b: f64, c: f64, d: f64, e: f64, ptr: *const u8, len: usize) -> f64;
}

#[cfg(not(target_arch = "wasm32"))]
unsafe fn call(
    _op: u32,
    _a: f64,
    _b: f64,
    _c: f64,
    _d: f64,
    _e: f64,
    _ptr: *const u8,
    _len: usize,
) -> f64 {
    0.0
}

const BEGIN: u32 = 0;
const MOVE: u32 = 1;
const ARC: u32 = 2;
const CLOSE: u32 = 3;
const FILL_STYLE: u32 = 4;
const FILL: u32 = 5;
const LINE_WIDTH: u32 = 6;
const STROKE_STYLE: u32 = 7;
const STROKE: u32 = 8;
const SAVE: u32 = 9;
const CLIP: u32 = 10;
const FILL_RECT: u32 = 11;
const RESTORE: u32 = 12;
const TRANSLATE: u32 = 13;
const CLEAR_RECT: u32 = 14;
const GRADIENT: u32 = 15;
const GRADIENT_STOP: u32 = 16;
const GRADIENT_FILL: u32 = 17;
const BACKGROUND: u32 = 18;
const TEXT_ALIGN: u32 = 19;
const TEXT_BASELINE: u32 = 20;
const FONT: u32 = 21;
const MEASURE_TEXT: u32 = 22;
const FILL_TEXT: u32 = 23;
const SHADOW_COLOR: u32 = 24;
const SHADOW_BLUR: u32 = 25;

fn command(op: u32, args: [f64; 5], text: &str) -> f64 {
    unsafe {
        call(
            op,
            args[0],
            args[1],
            args[2],
            args[3],
            args[4],
            text.as_ptr(),
            text.len(),
        )
    }
}
fn op(code: u32) {
    command(code, [0.0; 5], "");
}
fn number(code: u32, value: f64) {
    command(code, [value, 0.0, 0.0, 0.0, 0.0], "");
}
fn text(code: u32, value: &str) {
    command(code, [0.0; 5], value);
}
fn rect(code: u32, x: f64, y: f64, width: f64, height: f64) {
    command(code, [x, y, width, height, 0.0], "");
}
fn color(index: i32) -> &'static str {
    match index {
        1 => "#34d2e8",
        2 => "#f4c52e",
        3 => "#b05de0",
        4 => "#46cf6d",
        5 => "#ef4a5e",
        6 => "#3f7ef6",
        7 => "#ff9f2e",
        _ => "#000000",
    }
}
fn rgba(rgb: i32, alpha: f64) -> String {
    format!(
        "rgba({}, {}, {}, {})",
        (rgb >> 16) & 255,
        (rgb >> 8) & 255,
        rgb & 255,
        alpha
    )
}
fn hex(rgb: i32) -> String {
    format!("#{:06x}", rgb & 0xffffff)
}
fn js_round(value: f64) -> f64 {
    (value + 0.5).floor()
}
fn gap(cell: f64) -> f64 {
    if cell >= 18.0 {
        2.0
    } else {
        1.0
    }
}
fn radius(size: f64) -> f64 {
    js_round(size * 0.18).max(2.0)
}

fn round_rect(x: f64, y: f64, w: f64, h: f64, radius: f64) {
    let r = radius.min(w / 2.0).min(h / 2.0).max(0.0);
    op(BEGIN);
    command(MOVE, [x + r, y, 0.0, 0.0, 0.0], "");
    command(ARC, [x + w, y, x + w, y + h, r], "");
    command(ARC, [x + w, y + h, x, y + h, r], "");
    command(ARC, [x, y + h, x, y, r], "");
    command(ARC, [x, y, x + w, y, r], "");
    op(CLOSE);
}

fn gem(x: f64, y: f64, size: f64, index: i32, ghost: bool) {
    let base = color(index);
    let r = radius(size);
    round_rect(x, y, size, size, r);
    if ghost {
        let rgb = i32::from_str_radix(&base[1..], 16).unwrap_or(0);
        text(FILL_STYLE, &rgba(rgb, 0.10));
        op(FILL);
        number(LINE_WIDTH, 1.5);
        text(STROKE_STYLE, base);
        op(STROKE);
        return;
    }
    text(FILL_STYLE, base);
    op(FILL);
    op(SAVE);
    round_rect(x, y, size, size, r);
    op(CLIP);
    let top = (size * 0.10).max(1.0);
    let bottom = (size * 0.14).max(1.0);
    let side = (size * 0.10).max(1.0);
    text(FILL_STYLE, "rgba(255, 255, 255, 0.38)");
    rect(FILL_RECT, x, y, size, top);
    text(FILL_STYLE, "rgba(0, 0, 0, 0.28)");
    rect(FILL_RECT, x, y + size - bottom, size, bottom);
    text(FILL_STYLE, "rgba(255, 255, 255, 0.14)");
    rect(FILL_RECT, x, y, side, size);
    text(FILL_STYLE, "rgba(0, 0, 0, 0.18)");
    rect(FILL_RECT, x + size - side, y, side, size);
    op(RESTORE);
}

fn cell(x: i32, y: i32, pitch: f64, index: i32, ghost: bool) {
    let g = gap(pitch);
    gem(
        x as f64 * pitch + g / 2.0,
        y as f64 * pitch + g / 2.0,
        pitch - g,
        index,
        ghost,
    );
}

#[no_mangle]
pub extern "C" fn render_background(width: f64, height: f64, pitch: f64) {
    command(GRADIENT, [0.0, 0.0, 0.0, height, 0.0], "");
    command(GRADIENT_STOP, [0.0; 5], "#090b10");
    command(GRADIENT_STOP, [1.0, 0.0, 0.0, 0.0, 0.0], "#0b0e14");
    op(GRADIENT_FILL);
    rect(FILL_RECT, 0.0, 0.0, width, height);
    let g = gap(pitch);
    let s = pitch - g;
    number(LINE_WIDTH, 1.0);
    for y in 0..(height / pitch).floor() as i32 {
        for x in 0..(width / pitch).floor() as i32 {
            round_rect(
                x as f64 * pitch + g / 2.0,
                y as f64 * pitch + g / 2.0,
                s,
                s,
                radius(s),
            );
            text(FILL_STYLE, "rgba(255, 255, 255, 0.022)");
            op(FILL);
            text(STROKE_STYLE, "rgba(255, 255, 255, 0.025)");
            op(STROKE);
        }
    }
}

#[no_mangle]
pub extern "C" fn render_board(
    width: f64,
    height: f64,
    pitch: f64,
    kind: i32,
    rotation: i32,
    x: i32,
    y: i32,
    index: i32,
    ghost_enabled: i32,
    clear_active: i32,
    clear_frame: f64,
    clear_total: f64,
    intensity: i32,
    reduced_motion: i32,
    accent: i32,
) {
    let e = engine();
    let mut shaking = false;
    if clear_active != 0 && intensity >= 1 && reduced_motion == 0 {
        let decay = 1.0 - clear_frame / clear_total;
        let amp = if intensity >= 2 { 6.0 } else { 3.0 } * decay;
        let dx = js_round((clear_frame * 1.7).sin() * amp);
        let dy = js_round((clear_frame * 2.3).cos() * amp * 0.6);
        if dx != 0.0 || dy != 0.0 {
            text(FILL_STYLE, "#0b0e14");
            rect(FILL_RECT, 0.0, 0.0, width, height);
            op(SAVE);
            command(TRANSLATE, [dx, dy, 0.0, 0.0, 0.0], "");
            shaking = true;
        }
    }
    command(BACKGROUND, [width, height, 0.0, 0.0, 0.0], "");
    if ghost_enabled != 0 && kind != 0 && clear_active == 0 {
        let distance = e.drop_distance(kind, rotation, x, y);
        if distance > 0 {
            if let Some(shape) = Engine::shape(kind, rotation) {
                for [dx, dy] in shape {
                    if y + distance + dy >= 0 {
                        cell(x + dx, y + distance + dy, pitch, index, true);
                    }
                }
            }
        }
    }
    for row in 0..e.rows {
        for col in 0..e.cols {
            let value = e.board[row * e.cols + col];
            if value != 0 {
                cell(col as i32, row as i32, pitch, value as i32, false);
            }
        }
    }
    if let Some(shape) = Engine::shape(kind, rotation) {
        for [dx, dy] in shape {
            if y + dy >= 0 {
                cell(x + dx, y + dy, pitch, index, false);
            }
        }
    }
    if clear_active != 0 {
        let progress = clear_frame / clear_total;
        let flash = (0.85 + intensity as f64 * 0.07) * (1.0 - progress);
        op(SAVE);
        text(FILL_STYLE, &format!("rgba(255, 255, 255, {})", flash));
        for row in 0..e.rows {
            if e.selected_rows[row] != 0 {
                rect(FILL_RECT, 0.0, row as f64 * pitch, width, pitch);
            }
        }
        if intensity >= 2 {
            text(FILL_STYLE, &rgba(accent, 0.18 * (1.0 - progress)));
            rect(FILL_RECT, 0.0, 0.0, width, height);
        }
        op(RESTORE);
    }
    if shaking {
        op(RESTORE);
    }
}

fn preview_geometry(width: f64, height: f64, shape: &super::Shape) -> (f64, f64, f64) {
    let min_x = shape.iter().map(|v| v[0]).min().unwrap() as f64;
    let max_x = shape.iter().map(|v| v[0]).max().unwrap() as f64;
    let min_y = shape.iter().map(|v| v[1]).min().unwrap() as f64;
    let max_y = shape.iter().map(|v| v[1]).max().unwrap() as f64;
    let cols = max_x - min_x + 1.0;
    let rows = max_y - min_y + 1.0;
    let size = ((width - 4.0) / cols).min((height - 4.0) / rows).floor();
    let x = ((width - cols * size) / 2.0).floor() - min_x * size;
    let y = ((height - rows * size) / 2.0).floor() - min_y * size;
    (size, x, y)
}

#[no_mangle]
pub extern "C" fn render_preview(width: f64, height: f64, kind: i32) {
    rect(CLEAR_RECT, 0.0, 0.0, width, height);
    let Some(shape) = Engine::shape(kind, 0) else {
        return;
    };
    let (size, x, y) = preview_geometry(width, height, shape);
    for [dx, dy] in shape {
        gem(
            x + *dx as f64 * size,
            y + *dy as f64 * size,
            size,
            kind,
            false,
        );
    }
}

const TEXT_CAPACITY: usize = 16384;
static mut TEXT_BUFFER: [u8; TEXT_CAPACITY] = [0; TEXT_CAPACITY];
#[no_mangle]
pub extern "C" fn text_buffer_ptr() -> *mut u8 {
    std::ptr::addr_of_mut!(TEXT_BUFFER).cast::<u8>()
}

fn fit_font(value: &str, weight: i32, base: i32, min: i32, max_width: f64) {
    let mut px = base;
    text(
        FONT,
        &format!(
            "{} {}px \"Chakra Petch\", system-ui, sans-serif",
            weight, px
        ),
    );
    while px > min && command(MEASURE_TEXT, [0.0; 5], value) > max_width {
        px -= 1;
        text(
            FONT,
            &format!(
                "{} {}px \"Chakra Petch\", system-ui, sans-serif",
                weight, px
            ),
        );
    }
}

#[no_mangle]
pub extern "C" fn render_overlay(
    width: f64,
    height: f64,
    title_len: usize,
    subtitles_len: usize,
    title_color: i32,
) {
    if title_len + subtitles_len > TEXT_CAPACITY {
        return;
    }
    let bytes = unsafe { &*std::ptr::addr_of!(TEXT_BUFFER) };
    let title = String::from_utf8_lossy(&bytes[..title_len]);
    let subtitles = String::from_utf8_lossy(&bytes[title_len..title_len + subtitles_len]);
    text(FILL_STYLE, "rgba(7, 9, 13, 0.8)");
    rect(FILL_RECT, 0.0, 0.0, width, height);
    text(TEXT_ALIGN, "center");
    text(TEXT_BASELINE, "middle");
    let max_width = width - 16.0;
    op(SAVE);
    text(SHADOW_COLOR, &rgba(title_color, 0.6));
    number(SHADOW_BLUR, 18.0);
    text(FILL_STYLE, &hex(title_color));
    fit_font(&title, 700, 30, 16, max_width);
    command(
        FILL_TEXT,
        [width / 2.0, height / 2.0 - 22.0, 0.0, 0.0, 0.0],
        &title,
    );
    op(RESTORE);
    text(FILL_STYLE, "rgba(238, 241, 246, 0.7)");
    for (i, line) in subtitles.split('\n').enumerate() {
        fit_font(line, 500, 13, 8, max_width);
        command(
            FILL_TEXT,
            [
                width / 2.0,
                height / 2.0 + 10.0 + i as f64 * 22.0,
                0.0,
                0.0,
                0.0,
            ],
            line,
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preview_centers_piece_with_original_integer_geometry() {
        assert_eq!(
            preview_geometry(40.0, 30.0, Engine::shape(1, 0).unwrap()),
            (9.0, 11.0, 10.0)
        );
        assert_eq!(
            preview_geometry(52.0, 38.0, Engine::shape(4, 0).unwrap()),
            (16.0, 18.0, 19.0)
        );
    }
    #[test]
    fn shake_rounding_matches_browser_math_for_negative_half() {
        assert_eq!(js_round(-0.5), 0.0);
        assert_eq!(js_round(-1.5), -1.0);
        assert_eq!(radius(28.0), 5.0);
    }
}
