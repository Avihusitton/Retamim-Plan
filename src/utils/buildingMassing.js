/**
 * buildingMassing.js
 * -----------------
 * Converts a 2D footprint polygon + height into a THREE.BufferGeometry.
 * Runs entirely in the browser — no server, no API.
 *
 * Usage:
 *   import { generateMassing } from './buildingMassing';
 *   const geometry = generateMassing([[0,0],[10,0],[10,6],[0,6]], 8);
 *   const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xaaaaaa }));
 *   scene.add(mesh);
 */

import * as THREE from 'three';
import { primitives, extrusions, geometries } from '@jscad/modeling';

const { polygon } = primitives;
const { extrudeLinear } = extrusions;

/**
 * generateMassing
 * ---------------
 * @param {number[][]} footprintPoints  2D polygon vertices in meters, e.g. [[0,0],[12,0],[12,8],[0,8]]
 * @param {number}     heightMeters     Extrusion height in meters
 * @returns {THREE.BufferGeometry}      Ready-to-use geometry (1 unit = 1 metre, origin at bottom corner)
 */
export function generateMassing(footprintPoints, heightMeters) {
  if (!footprintPoints || footprintPoints.length < 3) {
    throw new Error('footprintPoints must contain at least 3 vertices');
  }
  if (!heightMeters || heightMeters <= 0) {
    throw new Error('heightMeters must be a positive number');
  }

  // --------------------------------------------------------------------------
  // 1. Build JSCAD polygon from 2D points
  //    JSCAD polygon() expects points in [x, y] order, wound counter-clockwise.
  //    We reverse if clockwise to ensure correct normals.
  // --------------------------------------------------------------------------
  const pts = footprintPoints.map(([x, y]) => [x, y]);

  // Compute signed area (shoelace) to determine winding
  let signedArea = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    signedArea += (x1 * y2 - x2 * y1);
  }
  const isCW = signedArea < 0;
  const orderedPts = isCW ? [...pts].reverse() : pts;

  // Create JSCAD polygon
  const footprint = polygon({ points: orderedPts });

  // --------------------------------------------------------------------------
  // 2. Extrude along Z axis (JSCAD Z = vertical)
  // --------------------------------------------------------------------------
  const solid = extrudeLinear({ height: heightMeters }, footprint);

  // --------------------------------------------------------------------------
  // 3. Convert JSCAD geometry to THREE.BufferGeometry
  //    JSCAD solid has .polygons[] — each polygon has .vertices[]
  //    Each vertex is a Vec3 [x, y, z] in JSCAD space where Z is up.
  //    THREE.js uses Y-up convention, so we remap: THREE(x, y, z) = JSCAD(x, z, y)
  // --------------------------------------------------------------------------
  const positions = [];
  const normals   = [];
  const indices   = [];

  let vertexOffset = 0;

  for (const jscadPolygon of solid.polygons) {
    const verts = jscadPolygon.vertices; // array of [x, y, z]

    // Triangulate (fan from first vertex — valid for convex JSCAD faces)
    for (let i = 1; i < verts.length - 1; i++) {
      const v0 = verts[0];
      const v1 = verts[i];
      const v2 = verts[i + 1];

      // Remap JSCAD (x, y, z) → THREE (x, z, -y) so Z-up becomes Y-up
      // and the building stands upright with footprint on the XZ plane
      positions.push(
        v0[0],  v0[2], -v0[1],
        v1[0],  v1[2], -v1[1],
        v2[0],  v2[2], -v2[1],
      );

      // Compute face normal for flat shading
      const ax = v1[0] - v0[0], ay = v1[2] - v0[2], az = -(v1[1] - v0[1]);
      const bx = v2[0] - v0[0], by = v2[2] - v0[2], bz = -(v2[1] - v0[1]);
      const nx = ay * bz - az * by;
      const ny = az * bx - ax * bz;
      const nz = ax * by - ay * bx;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;

      for (let k = 0; k < 3; k++) {
        normals.push(nx / len, ny / len, nz / len);
        indices.push(vertexOffset + k);
      }
      vertexOffset += 3;
    }
  }

  // --------------------------------------------------------------------------
  // 4. Build THREE.BufferGeometry
  // --------------------------------------------------------------------------
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal',   new THREE.Float32BufferAttribute(normals,   3));
  geometry.setIndex(indices);

  // --------------------------------------------------------------------------
  // 5. Log bounding box for verification
  // --------------------------------------------------------------------------
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox;
  const width  = parseFloat((bb.max.x - bb.min.x).toFixed(4));
  const height = parseFloat((bb.max.y - bb.min.y).toFixed(4));
  const depth  = parseFloat((bb.max.z - bb.min.z).toFixed(4));
  console.log(
    `[buildingMassing] BoundingBox → width=${width}m  depth=${depth}m  height=${height}m`
  );

  return geometry;
}
