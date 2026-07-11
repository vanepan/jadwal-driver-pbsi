'use strict';

import { makePlaceholderConnector } from './placeholder-connector.js';

export const analyticsConnector = makePlaceholderConnector(
  'analytics',
  'js/analytics/* outputs (inactive placeholder — not started).',
);

export default analyticsConnector;
