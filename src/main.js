import { corners } from './geometry.js';
import { localToLatLon } from './georef.js';

// Foundation sanity check — proves the modules load and compute.
const c = corners();
console.log('Lot corners (ft):', c);
console.log('geometry + georef modules loaded', typeof localToLatLon === 'function');
