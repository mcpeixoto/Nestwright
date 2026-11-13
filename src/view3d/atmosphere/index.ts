import { replaceSceneLayer } from '../layers'
import { createAtmosphereLayer } from './layer'

replaceSceneLayer('atmosphere', {
  id: 'atmosphere',
  create: createAtmosphereLayer,
})
