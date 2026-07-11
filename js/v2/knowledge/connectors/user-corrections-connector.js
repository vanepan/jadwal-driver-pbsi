'use strict';

import { makePlaceholderConnector } from './placeholder-connector.js';

export const userCorrectionsConnector = makePlaceholderConnector(
  'user_corrections',
  'Explicit human corrections (inactive placeholder — not started).',
);

export default userCorrectionsConnector;
