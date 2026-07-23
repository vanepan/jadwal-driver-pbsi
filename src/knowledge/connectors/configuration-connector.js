'use strict';

import { makePlaceholderConnector } from './placeholder-connector.js';

export const configurationConnector = makePlaceholderConnector(
  'configuration',
  'js/config/*, js/engineering/config/*, dispatch-policy-config.js, etc. (inactive placeholder — not started).',
);

export default configurationConnector;
