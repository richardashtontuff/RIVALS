import * as THREE from '/node_modules/three/build/three.module.js';

/** A separate local practice space; it never affects server matches. */
export function createPracticeRange() {
  const group = new THREE.Group();
  const box = (size, pos, color, name) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
    mesh.position.set(...pos);
    mesh.name = name;
    group.add(mesh);
    return mesh;
  };
  box([45, .5, 55], [0, -.25, -4], 0x747c7e, 'range_floor');
  box([45, 9, 1], [0, 4.5, -31], 0x374654, 'range_backstop');
  box([1, 9, 55], [-22, 4.5, -4], 0x4b555d, 'range_wall');
  box([1, 9, 55], [22, 4.5, -4], 0x4b555d, 'range_wall');
  for (const [x, z] of [[-7, -10], [0, -14], [7, -20]]) {
    box([.24, 2, .24], [x, 1, z - .3], 0x38434b, 'target_stand');
    const target = box([1.7, 1.7, .2], [x, 2.2, z], 0xe95a38, 'range_target');
    target.userData = { health: 50, maxHealth: 50, type: 'dummy' };
    const bullseye = new THREE.Mesh(new THREE.CircleGeometry(.35, 24), new THREE.MeshBasicMaterial({ color: 0xf8e6c5 }));
    bullseye.position.set(0, 0, .11);
    target.add(bullseye);
  }
  return group;
}
