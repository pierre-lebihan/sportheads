//! Native Rust regression tests against states captured from the original AS3 engine.
use sportheads_core::*;

fn replay(fixture: &str) {
    for (line_number, line) in fixture.lines().enumerate() {
        if line.starts_with('#') || line.trim().is_empty() {
            continue;
        }
        let mut words = line.split_whitespace();
        let command = words.next().unwrap();
        let a: Vec<f64> = words.map(|s| s.parse().unwrap()).collect();
        match command {
            "reset" => core_reset(a[0], a[1]),
            "circle" => {
                core_circle(
                    a[0],
                    a[1],
                    a[2],
                    a[3],
                    a[4],
                    a[5],
                    a[6] as u32,
                    a[7],
                    a[8],
                    a[9],
                );
            }
            "box" => {
                core_box(
                    a[0],
                    a[1],
                    a[2],
                    a[3],
                    a[4],
                    a[5],
                    a[6],
                    a[7],
                    a[8] as u32,
                    a[9],
                    a[10],
                    a[11],
                );
            }
            "joint" => {
                core_joint(a[0] as u32, a[1] as u32, a[2], a[3], a[4]);
            }
            "motor" => core_motor(a[0] as u32, a[1]),
            "tick" => core_tick(),
            "expect" => {
                for field in 0..8 {
                    let actual = core_body_value(a[0] as u32, field);
                    let expected = a[field as usize + 1];
                    assert!(
                        (actual - expected).abs() <= 1e-7,
                        "line {}, body {}, field {}: actual={} Flash={}",
                        line_number + 1,
                        a[0],
                        field,
                        actual,
                        expected
                    );
                }
            }
            "expect_joint" => {
                let angle = core_joint_angle(a[0] as u32);
                let error = core_joint_anchor_error(a[0] as u32);
                assert!(
                    (angle - a[1]).abs() <= 1e-7,
                    "joint angle, line {}: {} vs {}",
                    line_number + 1,
                    angle,
                    a[1]
                );
                assert!(
                    (error - a[2]).abs() <= 1e-7,
                    "joint anchor, line {}: {} vs {}",
                    line_number + 1,
                    error,
                    a[2]
                );
            }
            _ => panic!("unknown fixture command: {command}"),
        }
    }
}
macro_rules! fixture {
    ($test:ident,$name:literal) => {
        #[test]
        fn $test() {
            replay(include_str!(concat!("fixtures/physics/", $name, ".txt")));
        }
    };
}
fixture!(ball_floor, "ball-floor");
fixture!(ball_tilted_wall, "ball-tilted-wall");
fixture!(ball_box_corner, "ball-box-corner");
fixture!(ball_head, "ball-head");
fixture!(overlapping_circles, "overlapping-circles");
fixture!(motor_foot, "motor-foot");
fixture!(motor_torque_limit, "motor-torque-limit");
fixture!(motor_foot_ball, "motor-foot-ball");
fixture!(box_floor_two_points, "box-floor-two-points");
fixture!(box_rotated_floor, "box-rotated-floor");
fixture!(motor_foot_ground, "motor-foot-ground");
