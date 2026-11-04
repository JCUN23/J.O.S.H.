// =============================================================================
//  Sentinel wall mount: Raspberry Pi 5 + removable Galaxy Tab S7+ on gridwall
//  Units: mm.  Axes: X = along the wall, Y = away from the wall (front = +Y),
//  Z = up. z = 0 is the centre of the lowest gridwall wire a part uses.
//
//  Every part hangs on two horizontal gridwall wires one grid square apart:
//    * a J-hook over the UPPER wire carries the load
//    * a snap clip on the LOWER wire stops the part lifting off (removing the
//      tablet pushes upward, which would otherwise unhook the top caps)
//  Hooks sit mid-cell so they clear the vertical wires.
//
//  Render one part:  openscad -D 'part="bottom_shelf"' -o bottom_shelf.stl sentinel_mount.scad
//  Parts: assembly | bottom_shelf | top_cap | pi_tray | fit_test
// =============================================================================

part = "assembly";

// ---------- gridwall (Uline: 1/4" wire, 3" squares) -------------------------
wire_d     = 6.35;    // measure yours with calipers; print fit_test first
grid       = 76.2;    // 3" on centre
wire_clear = 0.45;    // radial clearance on the J-hook
snap_grip  = 0.92;    // snap mouth = wire_d * snap_grip (smaller = tighter).
                      // Lift resistance comes from the arm under the wire, not the mouth,
                      // so a gentle snap keeps strain low (PETG ~1.5%) without losing hold.
snap_arm   = 2.2;     // snap arm thickness
behind_gap = 5.0;     // how far the hook tab may reach behind the wire

// ---------- tablet: Galaxy Tab S7+ (bare). Add a case? change these 3. -------
tab_w = 285;  tab_h = 185;  tab_t = 5.7;
travel    = 12;  // headroom above the tablet: push up this far to free the bottom
bottom_lip = 8;  // must be < travel (with margin) so the bottom clears
top_lip    = 20; // must be > travel so the top stays captured at rest
tab_clear  = 0.8; // slack around the tablet's thickness

// ---------- Raspberry Pi 5 in the official case (≈ 98.5 x 70.3 x 33) ---------
pi_l = 98.5;  pi_w = 70.3;  pi_t = 33;  pi_clear = 0.6;
port_side = "left";  // side with USB-C/HDMI: left fully open (mirror if needed)

// ---------- structure ---------------------------------------------------------
plate_t   = 4;      // backplate thickness
part_w    = 40;     // width (X) of each shelf/cap; print with this axis vertical
air_gap   = 8;      // between the Pi's front face and the tablet's back
$fn = 64;

// derived: back plate sits just in front of the wires
plate_back  = wire_d/2 + wire_clear;
plate_front = plate_back + plate_t;
// The Pi tray is wider than one grid cell, so its plate crosses vertical wires.
// Standing it off by one wire diameter clears them whichever layer is in front.
pi_standoff = wire_d + 1;
tab_back    = plate_front + pi_standoff + pi_t + pi_clear + air_gap;  // tablet back plane (Y)
// tablet seat height on the bottom shelf (relative to the shelf's lower wire)
seat_z = 18;
// top cap uses wires 2 and 3; its ceiling is tab_h + travel above the seat
ceiling_z_abs = seat_z + tab_h + travel;          // in bottom-shelf frame
top_frame_off = 2 * grid;                         // top cap's lower wire is wire 2

echo(str("Tablet back plane at Y=", tab_back, " mm from wire centres"));
echo(str("Removal check: travel ", travel, " > bottom_lip ", bottom_lip, " : ", travel > bottom_lip + 2 ? "OK" : "TOO TIGHT"));
echo(str("Retention check: top_lip ", top_lip, " > travel ", travel, " : ", top_lip > travel + 4 ? "OK" : "TOO SHALLOW"));

// =============================================================================
// Gridwall attachment: plate spanning [z0, z1] with a J-hook on the wire at
// hook_z and a snap clip on the wire at snap_z (hook_z = snap_z + grid).
// =============================================================================
module j_hook(z, w = part_w, pb = plate_back) {
    r_in  = wire_d/2 + wire_clear;
    r_out = r_in + 3.2;
    drop  = 1.5;               // how far the tab reaches below the wire centre, behind it
    // profile drawn in the (Y, Z) plane, then extruded along X; mirrored in Z so the
    // arch sits OVER the wire (the part hangs from the top of the wire)
    translate([w/2, 0, z]) mirror([0, 0, 1]) rotate([0, -90, 0]) rotate([0, 0, 90])
    linear_extrude(height = w)
    difference() {
        union() {
            intersection() {                         // upper half ring over the wire
                circle(r = r_out);
                translate([-r_out, 0]) square([2 * r_out, r_out]);
            }
            translate([-r_out, -drop]) square([r_out - r_in, drop + 0.01]);   // tab behind
            translate([r_in, -r_out]) square([pb - r_in + 0.01, r_out]); // tie into plate
        }
        circle(r = r_in);
    }
}

module snap_clip(z, w = part_w, pb = plate_back) {
    r_in  = wire_d/2 + 0.1;
    r_out = r_in + snap_arm;
    mouth = wire_d * snap_grip;
    translate([w/2, 0, z]) rotate([0, -90, 0]) rotate([0, 0, 90])
    linear_extrude(height = w)
    difference() {
        union() {
            circle(r = r_out);
            translate([0, -r_out]) square([pb + 0.01, 2 * r_out]);   // tie into plate
        }
        circle(r = r_in);
        translate([-20, -mouth/2]) square([20, mouth]);   // mouth faces the wall (-Y)
    }
}

// Zip-tie slot through the plate beside the lower wire: belt-and-braces lock.
module zip_slot(z, w, pb = plate_back) {
    for (s = [-1, 1]) translate([s * (w/2 - 5) - 2, pb - 1, z - 7]) cube([4, plate_t + 2, 3]);
}

module wall_plate(z0, z1, snap_z, hook_z, w = part_w, vent = false, standoff = 0) {
    pb = plate_back + standoff;
    // hooks/snaps stay mid-cell (narrow) even when the plate is wider than a cell
    hw = min(w, 40);
    difference() {
        translate([-w/2, pb, z0]) cube([w, plate_t, z1 - z0]);
        // vents only where nothing structural attaches (Pi tray)
        if (vent) for (i = [0:4]) translate([-w/2 + 10 + i * (w - 20)/4 - 2, pb - 1, snap_z + 14])
            cube([4, plate_t + 2, grid - 28]);
        zip_slot(snap_z, hw, pb);
    }
    j_hook(hook_z, hw, pb);
    snap_clip(snap_z, hw, pb);
}

// =============================================================================
// Tablet bottom shelf: hangs on wires 0 (snap) and 1 (hook). Seat + short lip.
// =============================================================================
module bottom_shelf() {
    wall_plate(-10, grid + 8, 0, grid);
    shelf_t = 5;
    depth   = tab_back + tab_t + tab_clear + 3;   // to the front of the lip
    // arm from plate to the lip
    translate([-part_w/2, plate_front - 0.01, seat_z - shelf_t]) cube([part_w, depth - plate_front, shelf_t]);
    // gusset under the arm
    // full-width gusset web: the part prints lying on a side face, so every feature
    // must run the full width (nothing may start mid-air)
    hull() {
        translate([-part_w/2, plate_front - 0.01, seat_z - shelf_t - 22]) cube([part_w, 0.1, 22]);
        translate([-part_w/2, tab_back - 6, seat_z - shelf_t]) cube([part_w, 6, 0.1]);
    }
    // back pad the tablet leans on
    translate([-part_w/2, tab_back - 4, seat_z - 0.01]) cube([part_w, 4, 22]);
    // front lip (short: the bottom swings out past it)
    translate([-part_w/2, tab_back + tab_t + tab_clear, seat_z - 0.01]) cube([part_w, 3, bottom_lip]);
}

// =============================================================================
// Tablet top cap: hangs on wires 2 (snap) and 3 (hook). Deep pocket + tall lip.
// Drawn in its own frame (z=0 at wire 2); placed at +2*grid in the assembly.
// =============================================================================
module top_cap() {
    ceil_z = ceiling_z_abs - top_frame_off;      // ceiling height in this frame
    wall_plate(-10, max(grid + 10, ceil_z + 6), 0, grid);
    roof_t = 5;
    depth  = tab_back + tab_t + tab_clear + 3;
    translate([-part_w/2, plate_front - 0.01, ceil_z]) cube([part_w, depth - plate_front, roof_t]);
    // back pad
    translate([-part_w/2, tab_back - 4, ceil_z - 26]) cube([part_w, 4, 26.01]);
    // front lip hangs down in front of the tablet
    translate([-part_w/2, tab_back + tab_t + tab_clear, ceil_z - top_lip]) cube([part_w, 3, top_lip + 0.01]);
    // gussets above the roof
    hull() {   // full-width gusset web above the roof (see bottom_shelf)
        translate([-part_w/2, plate_front - 0.01, ceil_z + roof_t]) cube([part_w, 0.1, 18]);
        translate([-part_w/2, tab_back - 6, ceil_z + roof_t - 0.01]) cube([part_w, 6, 0.1]);
    }
}

// =============================================================================
// Pi tray: hangs on wires 1 (snap) and 2 (hook) in the middle column.
// Case stands upright (long axis vertical), USB/Ethernet end up, SD end down.
// =============================================================================
module pi_tray() {
    tw = pi_w + 2 * pi_clear;      // inner width (X)
    tl = pi_l + 2 * pi_clear;      // inner length (Z): case stands upright
    dp = pi_t + pi_clear;          // inner depth (Y)
    w  = tw + 10;
    z_bot = grid/2 - tl/2;         // centred between the two wires
    side  = (port_side == "left") ? 1 : -1;   // +1: closed side is +X
    wall_plate(min(-10, z_bot - 6), max(grid + 10, z_bot + tl + 4), 0, grid, w, vent = true, standoff = pi_standoff);
    pf = plate_front + pi_standoff;   // front face of this plate
    // bottom ledge (SD-card end rests here), with a notch for the SD slot
    difference() {
        translate([-tw/2 - 4, pf - 0.01, z_bot - 4]) cube([tw + 8, dp + 3, 4.01]);
        translate([-14, pf + 6, z_bot - 5]) cube([28, dp, 6]);
    }
    // stop ridge on the ledge at the open edge so it can't slide out
    translate([-side * (tw/2 + 2) - 1.5, pf, z_bot - 0.01]) cube([3, dp, 1.2]);
    // closed side: full-height rail...
    translate([side > 0 ? tw/2 : -tw/2 - 4, pf - 0.01, z_bot - 4]) cube([4, dp + 3, tl + 4]);
    // ...with front lips at the bottom and top corners (the Pi slides in from the open side)
    for (zz = [z_bot - 4, z_bot + tl - 16])
        translate([side > 0 ? tw/2 - 18 : -tw/2 - 4, pf + dp, zz]) cube([22, 3, 20]);
}

// =============================================================================
// Fit test coupon: just a hook + snap on a short plate. Print this first (~10 min).
// =============================================================================
module fit_test() {
    wall_plate(-12, grid + 8, 0, grid, 20);
}

// =============================================================================
// Assembly preview (ghosted wires, tablet and Pi for context)
// =============================================================================
module ghost_wires() {
    color("silver", 0.6) for (i = [0:3]) translate([-2 * grid, 0, i * grid]) rotate([0, 90, 0]) cylinder(d = wire_d, h = 4 * grid);
    color("silver", 0.6) for (j = [-2:2]) translate([j * grid + grid/2, -wire_d, -grid/2]) cylinder(d = wire_d, h = 4.5 * grid);
}
col = [-grid, grid];   // tablet pieces in the outer columns (cell centres)
if (part == "assembly") {
    ghost_wires();
    color("SteelBlue") for (x = col) translate([x, 0, 0]) bottom_shelf();
    color("SteelBlue") for (x = col) translate([x, 0, top_frame_off]) top_cap();
    color("Orange") translate([0, 0, grid]) pi_tray();
    color("DimGray", 0.85) translate([-tab_w/2, tab_back, seat_z]) cube([tab_w, tab_t, tab_h]);   // tablet
    color("ForestGreen", 0.8) translate([-pi_w/2, plate_front + pi_standoff + pi_clear, grid + grid/2 - pi_l/2]) cube([pi_w, pi_t, pi_l]); // Pi
} else if (part == "bottom_shelf") bottom_shelf();
else if (part == "top_cap")      top_cap();
else if (part == "pi_tray")      pi_tray();
else if (part == "fit_test")     fit_test();
