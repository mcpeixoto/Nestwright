import { registerSceneLayer } from '../layers'
import { createAtmosphereLayer } from './layer'

registerSceneLayer({
  id: 'atmosphere',
  create: createAtmosphereLayer,
})
