//! Original Box2D 2.0.2 quantized sweep-and-prune event ordering.
//! Bound crossings and query order are significant to contact/island order.
use crate::math::Vec2;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Event {
    pub a: usize,
    pub b: usize,
    pub added: bool,
}
#[derive(Clone, Copy)]
struct Bound {
    value: u32,
    id: usize,
    lower: bool,
}
#[derive(Clone)]
struct Pair {
    a: usize,
    b: usize,
    buffered: bool,
    removed: bool,
    finalized: bool,
}
#[derive(Clone)]
pub struct Broadphase {
    lower: Vec2,
    upper: Vec2,
    factor: Vec2,
    axes: [Vec<Bound>; 2],
    proxies: Vec<Option<(Vec2, Vec2)>>,
    pairs: Vec<Option<Pair>>,
    buffer: Vec<usize>,
}

impl Broadphase {
    pub fn new(lower: Vec2, upper: Vec2) -> Self {
        Self {
            lower,
            upper,
            factor: Vec2::new(65535.0 / (upper.x - lower.x), 65535.0 / (upper.y - lower.y)),
            axes: [vec![], vec![]],
            proxies: vec![],
            pairs: vec![],
            buffer: vec![],
        }
    }
    fn quantize(&self, bounds: (Vec2, Vec2)) -> ([u32; 2], [u32; 2]) {
        let x = |v: f64| self.factor.x * (v.min(self.upper.x).max(self.lower.x) - self.lower.x);
        let y = |v: f64| self.factor.y * (v.min(self.upper.y).max(self.lower.y) - self.lower.y);
        (
            [x(bounds.0.x) as u32 & 65534, y(bounds.0.y) as u32 & 65534],
            [
                x(bounds.1.x) as u32 & 65535 | 1,
                y(bounds.1.y) as u32 & 65535 | 1,
            ],
        )
    }
    // Return the first equality encountered by the original binary search,
    // rather than lower_bound; equal-valued insertion affects later queries.
    fn search(bounds: &[Bound], value: u32) -> usize {
        let mut lo = 0_isize;
        let mut hi = bounds.len() as isize - 1;
        while lo <= hi {
            let mid = (lo + hi) / 2;
            let found = bounds[mid as usize].value;
            if found > value {
                hi = mid - 1;
            } else if found < value {
                lo = mid + 1;
            } else {
                return mid as usize;
            }
        }
        lo as usize
    }
    fn index(&self, axis: usize, id: usize, lower: bool) -> usize {
        self.axes[axis]
            .iter()
            .position(|b| b.id == id && b.lower == lower)
            .unwrap()
    }
    fn values(&self, id: usize) -> ([u32; 2], [u32; 2]) {
        let mut lo = [0; 2];
        let mut hi = [0; 2];
        for axis in 0..2 {
            lo[axis] = self.axes[axis][self.index(axis, id, true)].value;
            hi[axis] = self.axes[axis][self.index(axis, id, false)].value;
        }
        (lo, hi)
    }
    fn overlaps(&self, values: &([u32; 2], [u32; 2]), other: usize) -> bool {
        let (lo, hi) = self.values(other);
        (0..2).all(|axis| values.0[axis] <= hi[axis] && values.1[axis] >= lo[axis])
    }
    fn query(&self, axis: usize, lo: u32, hi: u32) -> (usize, usize, Vec<usize>) {
        let bounds = &self.axes[axis];
        let lower = Self::search(bounds, lo);
        let upper = Self::search(bounds, hi);
        let mut result = vec![];
        for bound in &bounds[lower..upper] {
            if bound.lower {
                result.push(bound.id);
            }
        }
        // Equivalent to the original backwards stabbing-count scan. Inspecting
        // older non-stabbing bounds has no side effects and simplifies storage.
        for bound in bounds[..lower].iter().rev() {
            if bound.lower && lower <= self.index(axis, bound.id, false) {
                result.push(bound.id);
            }
        }
        (lower, upper, result)
    }
    fn add_pair(&mut self, a: usize, b: usize) {
        let i = self
            .pairs
            .iter()
            .position(|p| {
                p.as_ref()
                    .is_some_and(|p| (p.a == a && p.b == b) || (p.a == b && p.b == a))
            })
            .unwrap_or_else(|| {
                self.pairs.push(Some(Pair {
                    a,
                    b,
                    buffered: false,
                    removed: false,
                    finalized: false,
                }));
                self.pairs.len() - 1
            });
        let pair = self.pairs[i].as_mut().unwrap();
        if !pair.buffered {
            pair.buffered = true;
            self.buffer.push(i);
        }
        pair.removed = false;
    }
    fn remove_pair(&mut self, a: usize, b: usize) {
        let Some(i) = self.pairs.iter().position(|p| {
            p.as_ref()
                .is_some_and(|p| (p.a == a && p.b == b) || (p.a == b && p.b == a))
        }) else {
            return;
        };
        let pair = self.pairs[i].as_mut().unwrap();
        if !pair.buffered {
            pair.buffered = true;
            self.buffer.push(i);
        }
        pair.removed = true;
    }
    pub fn create(&mut self, id: usize, bounds: (Vec2, Vec2)) -> Vec<Event> {
        if self.proxies.len() <= id {
            self.proxies.resize(id + 1, None);
        }
        assert!(self.proxies[id].is_none());
        let (lo, hi) = self.quantize(bounds);
        let mut seen = vec![false; self.proxies.len()];
        let mut results = vec![];
        for axis in 0..2 {
            let (li, ui, hits) = self.query(axis, lo[axis], hi[axis]);
            for other in hits {
                if seen[other] {
                    results.push(other);
                } else {
                    seen[other] = true;
                }
            }
            self.axes[axis].insert(
                ui,
                Bound {
                    value: hi[axis],
                    id,
                    lower: false,
                },
            );
            self.axes[axis].insert(
                li,
                Bound {
                    value: lo[axis],
                    id,
                    lower: true,
                },
            );
        }
        self.proxies[id] = Some(bounds);
        for other in results {
            self.add_pair(id, other);
        }
        self.commit()
    }
    pub fn destroy(&mut self, id: usize) -> Vec<Event> {
        let mut seen = vec![false; self.proxies.len()];
        let mut results = vec![];
        for axis in 0..2 {
            let li = self.index(axis, id, true);
            let ui = self.index(axis, id, false);
            let lo = self.axes[axis][li].value;
            let hi = self.axes[axis][ui].value;
            self.axes[axis].remove(ui);
            self.axes[axis].remove(li);
            for other in self.query(axis, lo, hi).2 {
                if seen[other] {
                    results.push(other);
                } else {
                    seen[other] = true;
                }
            }
        }
        for other in results {
            self.remove_pair(id, other);
        }
        let events = self.commit();
        self.proxies[id] = None;
        events
    }
    pub fn refilter(&mut self, id: usize) -> Vec<Event> {
        let bounds = self.proxies[id].unwrap();
        let mut events = self.destroy(id);
        events.extend(self.create(id, bounds));
        events
    }
    pub fn move_proxy(&mut self, id: usize, bounds: (Vec2, Vec2)) {
        let new = self.quantize(bounds);
        let old = self.values(id);
        self.proxies[id] = Some(bounds);
        for axis in 0..2 {
            let li = self.index(axis, id, true);
            let ui = self.index(axis, id, false);
            self.axes[axis][li].value = new.0[axis];
            self.axes[axis][ui].value = new.1[axis];
            // Expanding lower left, expanding upper right, shrinking lower right,
            // shrinking upper left -- this exact order buffers contact changes.
            if new.0[axis] < old.0[axis] {
                let mut i = li;
                while i > 0 && new.0[axis] < self.axes[axis][i - 1].value {
                    let other = self.axes[axis][i - 1];
                    if !other.lower && self.overlaps(&new, other.id) {
                        self.add_pair(id, other.id);
                    }
                    self.axes[axis].swap(i, i - 1);
                    i -= 1;
                }
            }
            if new.1[axis] > old.1[axis] {
                let mut i = self.index(axis, id, false);
                while i + 1 < self.axes[axis].len() && self.axes[axis][i + 1].value <= new.1[axis] {
                    let other = self.axes[axis][i + 1];
                    if other.lower && self.overlaps(&new, other.id) {
                        self.add_pair(id, other.id);
                    }
                    self.axes[axis].swap(i, i + 1);
                    i += 1;
                }
            }
            if new.0[axis] > old.0[axis] {
                let mut i = self.index(axis, id, true);
                while i + 1 < self.axes[axis].len() && self.axes[axis][i + 1].value <= new.0[axis] {
                    let other = self.axes[axis][i + 1];
                    if !other.lower && self.overlaps(&old, other.id) {
                        self.remove_pair(id, other.id);
                    }
                    self.axes[axis].swap(i, i + 1);
                    i += 1;
                }
            }
            if new.1[axis] < old.1[axis] {
                let mut i = self.index(axis, id, false);
                while i > 0 && new.1[axis] < self.axes[axis][i - 1].value {
                    let other = self.axes[axis][i - 1];
                    if other.lower && self.overlaps(&old, other.id) {
                        self.remove_pair(id, other.id);
                    }
                    self.axes[axis].swap(i, i - 1);
                    i -= 1;
                }
            }
        }
    }
    pub fn commit(&mut self) -> Vec<Event> {
        let mut result = vec![];
        for i in std::mem::take(&mut self.buffer) {
            let pair = self.pairs[i].as_mut().unwrap();
            pair.buffered = false;
            if pair.removed {
                if pair.finalized {
                    result.push(Event {
                        a: pair.a,
                        b: pair.b,
                        added: false,
                    });
                }
                self.pairs[i] = None;
            } else if !pair.finalized {
                result.push(Event {
                    a: pair.a,
                    b: pair.b,
                    added: true,
                });
                pair.finalized = true;
            }
        }
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn bounds(x: f64, y: f64) -> (Vec2, Vec2) {
        (Vec2::new(x, y), Vec2::new(x + 2.0, y + 2.0))
    }
    fn world() -> Broadphase {
        Broadphase::new(Vec2::default(), Vec2::new(100.0, 100.0))
    }
    #[test]
    fn creation_and_move_preserve_initiating_proxy_orientation() {
        let mut bp = world();
        assert!(bp.create(0, bounds(10.0, 10.0)).is_empty());
        assert_eq!(
            bp.create(1, bounds(11.0, 11.0)),
            vec![Event {
                a: 1,
                b: 0,
                added: true
            }]
        );
        bp.move_proxy(1, bounds(20.0, 11.0));
        assert_eq!(
            bp.commit(),
            vec![Event {
                a: 1,
                b: 0,
                added: false
            }]
        );
        bp.move_proxy(0, bounds(19.0, 11.0));
        assert_eq!(
            bp.commit(),
            vec![Event {
                a: 0,
                b: 1,
                added: true
            }]
        );
    }
    #[test]
    fn buffered_add_remove_and_remove_add_cancel() {
        let mut bp = world();
        bp.create(0, bounds(10.0, 10.0));
        bp.create(1, bounds(20.0, 10.0));
        bp.move_proxy(1, bounds(11.0, 10.0));
        bp.move_proxy(1, bounds(20.0, 10.0));
        assert!(bp.commit().is_empty());
        bp.move_proxy(1, bounds(11.0, 10.0));
        assert_eq!(bp.commit().len(), 1);
        bp.move_proxy(1, bounds(20.0, 10.0));
        bp.move_proxy(1, bounds(11.0, 10.0));
        assert!(bp.commit().is_empty());
    }
    #[test]
    fn refilter_removes_and_recreates_existing_pair() {
        let mut bp = world();
        bp.create(0, bounds(10.0, 10.0));
        bp.create(1, bounds(11.0, 10.0));
        assert_eq!(
            bp.refilter(0),
            vec![
                Event {
                    a: 1,
                    b: 0,
                    added: false
                },
                Event {
                    a: 0,
                    b: 1,
                    added: true
                }
            ]
        );
    }
}
