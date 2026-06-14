// ─── Plot Ground Plane + Street ────────────────────────────────────────────
import * as THREE from 'three';

/**
 * Creates a ground plane showing the plot boundary, street, and sidewalk.
 * All coordinates are in meters, centered on the scene origin.
 *
 * THREE.js coordinate system note:
 *   THREE.Shape(x, y) after rotation.x = -PI/2 renders at Scene(x, 0, -y).
 *   Therefore: to render at Scene(sceneX, 0, sceneZ) → Shape(sceneX, -sceneZ).
 *
 * Plot corners are stored as [sceneX, sceneZ] pairs.
 * Street is on the EAST side (positive sceneX).
 * setback: 5m from street (east), 3m from all other sides.
 */
export function createPlotGround(scene) {
  // Plot boundary [sceneX, sceneZ] — centered at scene origin
  const plotCorners = [
     5.65,  17.54,
     9.32,   8.05,
    11.24,   0.43,
    12.70, -10.75,
   -17.64, -17.30,
   -21.25,   2.05,
  ];
  const n = plotCorners.length / 2;

  // ── 1. Large grey base ground (road + surroundings) ──────────────────────
  const groundGeo = new THREE.PlaneGeometry(120, 120);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0xb8b8b8,
    roughness: 0.95,
    metalness: 0.0,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  ground.name = 'street-ground';
  scene.add(ground);

  // ── 2. Sidewalk strip (east side) ────────────────────────────────────────
  // Shape(x,y) → Scene(x, -y). Sidewalk: sceneX=9..15, sceneZ=-20..20
  // → ShapeX=9..15, ShapeY=20..-20  (negate sceneZ)
  const sidewalkShape = new THREE.Shape();
  sidewalkShape.moveTo( 9.0,  20.0);
  sidewalkShape.lineTo(15.0,  20.0);
  sidewalkShape.lineTo(15.0, -20.0);
  sidewalkShape.lineTo( 9.0, -20.0);
  sidewalkShape.closePath();

  const sidewalkGeo = new THREE.ShapeGeometry(sidewalkShape);
  const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0xd8d0c0, roughness: 0.9 });
  const sidewalk = new THREE.Mesh(sidewalkGeo, sidewalkMat);
  sidewalk.rotation.x = -Math.PI / 2;
  sidewalk.position.y = -0.01;
  sidewalk.receiveShadow = true;
  sidewalk.name = 'sidewalk';
  scene.add(sidewalk);

  // ── 3. Plot fill ──────────────────────────────────────────────────────────
  // Shape(sceneX, -sceneZ) → after rotation renders at Scene(sceneX, 0, sceneZ)
  const plotShape = new THREE.Shape();
  plotShape.moveTo(plotCorners[0], -plotCorners[1]);
  for (let i = 1; i < n; i++) {
    plotShape.lineTo(plotCorners[i * 2], -plotCorners[i * 2 + 1]);
  }
  plotShape.closePath();

  const plotGeo = new THREE.ShapeGeometry(plotShape);
  const plotMat = new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.9 });
  const plotMesh = new THREE.Mesh(plotGeo, plotMat);
  plotMesh.rotation.x = -Math.PI / 2;
  plotMesh.position.y = 0.0;
  plotMesh.receiveShadow = true;
  plotMesh.name = 'plot-fill';
  scene.add(plotMesh);

  // ── 4. Plot boundary outline — green line ────────────────────────────────
  // Direct scene Vector3(sceneX, y, sceneZ)
  const outlinePoints = [];
  for (let i = 0; i <= n; i++) {
    const idx = (i % n) * 2;
    outlinePoints.push(new THREE.Vector3(plotCorners[idx], 0.05, plotCorners[idx + 1]));
  }
  const plotLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(outlinePoints),
    new THREE.LineBasicMaterial({ color: 0x2d8a4e })
  );
  plotLine.name = 'plot-outline';
  scene.add(plotLine);

  // ── 5. Street edge line — red (east boundary of sidewalk at x≈14.7) ──────
  const streetLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(14.7, 0.06, -20.0),
      new THREE.Vector3(14.7, 0.06,  20.0),
    ]),
    new THREE.LineBasicMaterial({ color: 0xcc2222 })
  );
  streetLine.name = 'street-edge';
  scene.add(streetLine);

  // ── 6. Setback outline — orange (5m east/street, 3m all others) ─────────
  // Proper parallel-edge offset: each edge is moved inward by d metres
  // (keeping it parallel to itself), then consecutive offset-edges are
  // intersected to find the new inset vertices.
  //
  // Coordinate system: plotCorners = [sceneX, sceneZ, ...].
  // For this polygon the inward normal of an edge (dx,dz) is (dz,-dx)/len.
  // (Verified: signed-area is negative → CW in XZ screen-space →
  //  right-hand perpendicular points inward.)
  // Outward normal = (-dz, dx)/len. East-facing edge: outward_x > 0.5.

  (function addSetback() {
    // Build edge list
    const edges = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = plotCorners[i * 2],  az = plotCorners[i * 2 + 1];
      const bx = plotCorners[j * 2],  bz = plotCorners[j * 2 + 1];
      const dx = bx - ax, dz = bz - az;
      const len = Math.hypot(dx, dz) || 1;
      const ux = dx / len, uz = dz / len;   // unit edge direction
      // Inward normal (verified for this polygon):
      const nx =  uz;   // = dz/len
      const nz = -ux;   // = -dx/len
      // Outward normal x-component → east-facing?
      const outwardX = -uz;  // = -dz/len
      const d = outwardX > 0.5 ? 5 : 3;    // 5 m street, 3 m neighbour
      // Offset start-point of this edge inward by d:
      edges.push({ px: ax + nx * d, pz: az + nz * d, ux, uz });
    }

    // Intersect consecutive offset-edges to get inset vertices
    const insetPts = [];
    for (let i = 0; i < n; i++) {
      const e1 = edges[(i - 1 + n) % n];  // prev edge
      const e2 = edges[i];                 // this edge
      const denom = e1.ux * e2.uz - e1.uz * e2.ux;
      if (Math.abs(denom) < 1e-9) {
        // Parallel edges — use offset start of current edge
        insetPts.push(new THREE.Vector3(e2.px, 0.06, e2.pz));
      } else {
        const t = ((e2.px - e1.px) * e2.uz - (e2.pz - e1.pz) * e2.ux) / denom;
        insetPts.push(new THREE.Vector3(
          e1.px + t * e1.ux,
          0.06,
          e1.pz + t * e1.uz
        ));
      }
    }
    insetPts.push(insetPts[0].clone()); // close loop

    const setbackLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(insetPts),
      new THREE.LineBasicMaterial({ color: 0xf59e0b })
    );
    setbackLine.name = 'setback-line';
    scene.add(setbackLine);
  })();
}
