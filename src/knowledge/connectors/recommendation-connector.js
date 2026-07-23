'use strict';

import { makePlaceholderConnector } from './placeholder-connector.js';

export const recommendationConnector = makePlaceholderConnector(
  'recommendation',
  'js/recommendation/* and js/simulation/* outputs (inactive placeholder — not started).',
);

export default recommendationConnector;
