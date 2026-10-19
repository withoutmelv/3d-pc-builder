import * as THREE from 'three';

// Coordinates match the delivered AM5 pin-one anchor and the DIMM's actual keyed notch.
export function createAlignmentMarker(kind, color = '#f4cd72') {
  const vertices =
    kind === 'cpu'
      ? [-20, 5, -20, -13, 5, -20, -13, 5, -20, -20, 5, -13, -20, 5, -13, -20, 5, -20]
      : [-7, 6, 4, 7, 6, 4, 7, 6, 4, 7, 6, 10, 7, 6, 10, -7, 6, 10, -7, 6, 10, -7, 6, 4];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  const marker = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ color, depthTest: false, depthWrite: false }),
  );
  marker.renderOrder = 25;
  return marker;
}
