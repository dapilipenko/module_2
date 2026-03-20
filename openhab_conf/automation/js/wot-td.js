'use strict';

const { items, log, rules, triggers } = require('openhab');

const logger = log('wot-td');

const OUTPUT_ITEMS = {
  jsonLd: 'TD_Gateway_JSONLD',
  json: 'TD_Gateway_JSON',
  context: 'TD_Context_JSONLD',
  directory: 'TD_Directory',
  query: 'TD_Directory_Query',
  result: 'TD_Directory_Result',
  validationStatus: 'TD_Validation_Status',
  validationReport: 'TD_Validation_Report'
};

const METADATA_SEED = {
  Gateway_Temperature: {
    wot: {
      value: 'Property',
      configuration: {
        propertyName: 'temperature',
        title: 'Temperature',
        description: 'Aggregated ambient temperature from MQTT and Zigbee sources',
        schemaType: 'number',
        unit: 'degree Celsius',
        readOnly: 'true',
        observable: 'true',
        eventName: 'temperatureChanged',
        eventTitle: 'Temperature Changed',
        eventDescription: 'Temperature state change stream',
        eventDataType: 'number',
        eventUnit: 'degree Celsius',
        semanticTypes: 'sosa:ObservableProperty,sosa:Temperature'
      }
    },
    sosa: {
      value: 'sosa:ObservableProperty,sosa:Temperature',
      configuration: {}
    },
    iot: {
      value: 'GatewayPoint',
      configuration: {
        capability: 'temperature',
        location: 'home'
      }
    },
    interop: {
      value: 'ProtocolHints',
      configuration: {
        matterCluster: 'TemperatureMeasurement',
        ocfResourceType: 'oic.r.temperature',
        oneM2MResource: 'm2m:cin'
      }
    }
  },
  Gateway_Humidity: {
    wot: {
      value: 'Property',
      configuration: {
        propertyName: 'humidity',
        title: 'Humidity',
        description: 'Gateway-relative humidity observed from MQTT sensors',
        schemaType: 'number',
        unit: 'percent',
        readOnly: 'true',
        observable: 'true',
        eventName: 'humidityChanged',
        eventTitle: 'Humidity Changed',
        eventDescription: 'Humidity state change stream',
        eventDataType: 'number',
        eventUnit: 'percent',
        semanticTypes: 'sosa:ObservableProperty,sosa:Humidity'
      }
    },
    sosa: {
      value: 'sosa:ObservableProperty,sosa:Humidity',
      configuration: {}
    },
    iot: {
      value: 'GatewayPoint',
      configuration: {
        capability: 'humidity',
        location: 'home'
      }
    },
    interop: {
      value: 'ProtocolHints',
      configuration: {
        matterCluster: 'RelativeHumidityMeasurement',
        ocfResourceType: 'oic.r.humidity',
        oneM2MResource: 'm2m:cin'
      }
    }
  },
  Gateway_Battery: {
    wot: {
      value: 'Property',
      configuration: {
        propertyName: 'battery',
        title: 'Battery',
        description: 'Battery level of the Zigbee edge device',
        schemaType: 'number',
        unit: 'percent',
        readOnly: 'true',
        observable: 'true',
        eventName: 'batteryChanged',
        eventTitle: 'Battery Changed',
        eventDescription: 'Battery level change stream',
        eventDataType: 'number',
        eventUnit: 'percent',
        semanticTypes: 'sosa:ObservableProperty'
      }
    },
    sosa: {
      value: 'sosa:ObservableProperty',
      configuration: {}
    },
    iot: {
      value: 'GatewayPoint',
      configuration: {
        capability: 'battery',
        location: 'home'
      }
    },
    interop: {
      value: 'ProtocolHints',
      configuration: {
        matterCluster: 'PowerSource',
        ocfResourceType: 'oic.r.energy.consumption',
        oneM2MResource: 'm2m:cin'
      }
    }
  },
  Gateway_LQI: {
    wot: {
      value: 'Property',
      configuration: {
        propertyName: 'lqi',
        title: 'Link Quality',
        description: 'Zigbee link quality indicator exposed by the gateway',
        schemaType: 'number',
        unit: 'rssi',
        readOnly: 'true',
        observable: 'true',
        eventName: 'linkQualityChanged',
        eventTitle: 'Link Quality Changed',
        eventDescription: 'LQI change stream',
        eventDataType: 'number',
        eventUnit: 'rssi',
        semanticTypes: 'sosa:ObservableProperty'
      }
    },
    sosa: {
      value: 'sosa:ObservableProperty',
      configuration: {}
    },
    iot: {
      value: 'GatewayPoint',
      configuration: {
        capability: 'linkquality',
        location: 'home'
      }
    },
    interop: {
      value: 'ProtocolHints',
      configuration: {
        matterCluster: 'NetworkCommissioning',
        ocfResourceType: 'oic.r.signal-strength',
        oneM2MResource: 'm2m:cin'
      }
    }
  },
  Gateway_Light: {
    wot: {
      value: 'Property',
      configuration: {
        propertyName: 'light',
        title: 'Light',
        description: 'Binary lighting actuator state aggregated by the gateway',
        schemaType: 'boolean',
        readOnly: 'false',
        observable: 'true',
        propertyOps: 'readproperty,writeproperty',
        actionName: 'setLight',
        actionTitle: 'Set Light',
        actionDescription: 'Toggle the gateway light state',
        actionInputType: 'boolean',
        actionSemanticTypes: 'sosa:Actuator',
        eventName: 'lightChanged',
        eventTitle: 'Light Changed',
        eventDescription: 'Light state change stream',
        eventDataType: 'boolean',
        semanticTypes: 'sosa:Actuator'
      }
    },
    sosa: {
      value: 'sosa:Actuator',
      configuration: {}
    },
    iot: {
      value: 'GatewayPoint',
      configuration: {
        capability: 'light',
        location: 'home'
      }
    },
    interop: {
      value: 'ProtocolHints',
      configuration: {
        matterCluster: 'OnOff',
        ocfResourceType: 'oic.r.switch.binary',
        oneM2MResource: 'm2m:actr'
      }
    }
  },
  Gateway_Dimmer: {
    wot: {
      value: 'Property',
      configuration: {
        propertyName: 'dimmer',
        title: 'Dimmer',
        description: 'Lighting dimmer percentage controlled through the gateway',
        schemaType: 'number',
        unit: 'percent',
        readOnly: 'false',
        observable: 'true',
        propertyOps: 'readproperty,writeproperty',
        actionName: 'setDimmer',
        actionTitle: 'Set Dimmer',
        actionDescription: 'Set light brightness',
        actionInputType: 'number',
        actionMinimum: '0',
        actionMaximum: '100',
        actionSemanticTypes: 'sosa:Actuator',
        eventName: 'dimmerChanged',
        eventTitle: 'Dimmer Changed',
        eventDescription: 'Dimmer level change stream',
        eventDataType: 'number',
        eventUnit: 'percent',
        semanticTypes: 'sosa:Actuator'
      }
    },
    sosa: {
      value: 'sosa:Actuator',
      configuration: {}
    },
    iot: {
      value: 'GatewayPoint',
      configuration: {
        capability: 'dimming',
        location: 'home'
      }
    },
    interop: {
      value: 'ProtocolHints',
      configuration: {
        matterCluster: 'LevelControl',
        ocfResourceType: 'oic.r.light.dimming',
        oneM2MResource: 'm2m:actr'
      }
    }
  },
  TD_Directory: {
    wot: {
      value: 'Directory',
      configuration: {
        thingId: 'urn:openhab:thing:gateway',
        thingTitle: 'OpenHAB Gateway',
        thingDescription: 'Semantically annotated IoT gateway that exposes MQTT and Zigbee capabilities as W3C WoT Thing Descriptions',
        thingTypes: 'iot:Gateway,sosa:Platform',
        profile: 'http://www.w3.org/ns/td',
        securityName: 'nosec_sc',
        securityScheme: 'nosec',
        contextItem: 'TD_Context_JSONLD'
      }
    },
    iot: {
      value: 'DirectoryConfig',
      configuration: {
        baseUrl: 'http://localhost:8080',
        location: 'home'
      }
    }
  }
};

const DEFAULT_CONTEXT_DOCUMENT = {
  '@context': {
    iot: 'https://example.org/iot#',
    gateway: 'https://example.org/iot/gateway#',
    capability: 'iot:capability',
    location: 'iot:location',
    sourceItem: 'iot:sourceItem',
    protocolMappings: 'iot:protocolMappings',
    matterCluster: 'iot:matterCluster',
    ocfResourceType: 'iot:ocfResourceType',
    oneM2MResource: 'iot:oneM2MResource',
    validationStatus: 'iot:validationStatus',
    validationErrors: 'iot:validationErrors',
    tdType: 'iot:tdType',
    madeBySensor: {
      '@id': 'sosa:madeBySensor',
      '@type': '@id'
    },
    observes: {
      '@id': 'sosa:observes',
      '@type': '@id'
    }
  }
};

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === '' || String(value) === 'NULL' || String(value) === 'UNDEF';
}

function splitCsv(value, fallbackValue = []) {
  if (isBlank(value)) {
    return fallbackValue.slice();
  }

  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function parseBoolean(value, fallbackValue = false) {
  if (isBlank(value)) {
    return fallbackValue;
  }

  const normalized = String(value).trim().toLowerCase();

  if (['true', 'yes', 'on', '1'].includes(normalized)) {
    return true;
  }

  if (['false', 'no', 'off', '0'].includes(normalized)) {
    return false;
  }

  return fallbackValue;
}

function parseNumber(value, fallbackValue = null) {
  if (isBlank(value)) {
    return fallbackValue;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallbackValue;
}

function parseJson(value, fallbackValue, label) {
  const source = isBlank(value) ? JSON.stringify(fallbackValue) : value;

  try {
    return JSON.parse(source);
  } catch (error) {
    logger.warn(`Unable to parse ${label}: ${error.message}`);
    return fallbackValue;
  }
}

function dedupe(values) {
  return Array.from(new Set(values.filter((value) => !isBlank(value))));
}

function cleanLabel(label, fallbackValue) {
  if (isBlank(label)) {
    return fallbackValue;
  }

  return String(label)
    .replace(/\s*\[.*\]\s*$/, '')
    .trim();
}

function camelCaseFromItemName(itemName) {
  const baseName = String(itemName).replace(/^Gateway_/, '');
  const parts = baseName.split('_').filter((entry) => entry.length > 0);

  if (parts.length === 0) {
    return itemName;
  }

  return parts
    .map((part, index) => {
      const lower = part.toLowerCase();
      return index === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join('');
}

function inferSchemaType(itemType) {
  const normalized = String(itemType || '').toLowerCase();

  if (normalized.includes('switch')) {
    return 'boolean';
  }

  if (normalized.includes('dimmer') || normalized.includes('number') || normalized.includes('rollershutter')) {
    return 'number';
  }

  return 'string';
}

function getMetadata(item, namespace) {
  return item ? items.metadata.getMetadata(item.name || item, namespace) : null;
}

function getMetadataConfig(item, namespace) {
  const metadata = getMetadata(item, namespace);
  return metadata && metadata.configuration ? metadata.configuration : {};
}

function buildProtocolMappings(protocolConfig) {
  const mappings = {};

  ['matterCluster', 'ocfResourceType', 'oneM2MResource'].forEach((key) => {
    if (!isBlank(protocolConfig[key])) {
      mappings[key] = String(protocolConfig[key]);
    }
  });

  return Object.keys(mappings).length > 0 ? mappings : null;
}

function sameConfig(left, right) {
  return JSON.stringify(left || {}) === JSON.stringify(right || {});
}

function ensureMetadata(itemName, namespace, value, configuration) {
  const existing = items.metadata.getMetadata(itemName, namespace);

  if (existing === null) {
    items.metadata.addMetadata(itemName, namespace, value, configuration);
    return;
  }

  if (existing.value !== value || !sameConfig(existing.configuration, configuration)) {
    items.metadata.replaceMetadata(itemName, namespace, value, configuration);
  }
}

function seedSemanticMetadata() {
  Object.entries(METADATA_SEED).forEach(([itemName, namespaces]) => {
    Object.entries(namespaces).forEach(([namespace, metadata]) => {
      ensureMetadata(itemName, namespace, metadata.value, metadata.configuration);
    });
  });
}

function getThingConfig() {
  const directoryItem = items.getItem(OUTPUT_ITEMS.directory);
  const wotConfig = getMetadataConfig(directoryItem, 'wot');
  const iotConfig = getMetadataConfig(directoryItem, 'iot');
  const baseUrl = iotConfig.baseUrl || 'http://localhost:8080';

  return {
    baseUrl,
    thingId: wotConfig.thingId || 'urn:openhab:thing:gateway',
    title: wotConfig.thingTitle || 'OpenHAB Gateway',
    description: wotConfig.thingDescription || 'Semantically annotated OpenHAB gateway',
    types: splitCsv(wotConfig.thingTypes, ['iot:Gateway', 'sosa:Platform']),
    profile: wotConfig.profile || 'http://www.w3.org/ns/td',
    securityName: wotConfig.securityName || 'nosec_sc',
    securityScheme: wotConfig.securityScheme || 'nosec',
    location: iotConfig.location || 'home',
    contextItem: wotConfig.contextItem || OUTPUT_ITEMS.context
  };
}

function buildPropertyForms(baseUrl, itemName, propertyOps) {
  const forms = [];

  if (propertyOps.includes('readproperty')) {
    forms.push({
      href: `${baseUrl}/rest/items/${itemName}/state`,
      op: ['readproperty'],
      contentType: 'text/plain'
    });
  }

  if (propertyOps.includes('writeproperty')) {
    forms.push({
      href: `${baseUrl}/rest/items/${itemName}`,
      op: ['writeproperty'],
      contentType: 'text/plain'
    });
  }

  return forms;
}

function buildActionForm(baseUrl, itemName) {
  return [{
    href: `${baseUrl}/rest/items/${itemName}`,
    op: ['invokeaction'],
    contentType: 'text/plain'
  }];
}

function buildEventForm(baseUrl, itemName) {
  return [{
    href: `${baseUrl}/rest/events?topics=openhab/items/${itemName}/statechanged`,
    op: ['subscribeevent'],
    contentType: 'text/event-stream',
    subprotocol: 'sse'
  }];
}

function addSemanticAnnotations(entry, definition, includeContext) {
  if (definition.semanticTypes.length > 0) {
    if (includeContext) {
      entry['@type'] = definition.semanticTypes;
    } else {
      entry.semanticTypes = definition.semanticTypes;
    }
  }

  if (!isBlank(definition.capability)) {
    entry.capability = definition.capability;
  }

  if (!isBlank(definition.location)) {
    entry.location = definition.location;
  }

  entry.sourceItem = definition.itemName;

  if (definition.protocolMappings) {
    entry.protocolMappings = definition.protocolMappings;
  }
}

function buildAffordanceDefinitions(thingConfig) {
  return items.getItems()
    .filter((item) => item.name.startsWith('Gateway_'))
    .map((item) => {
      const wotMetadata = getMetadata(item, 'wot');

      if (!wotMetadata || wotMetadata.value !== 'Property') {
        return null;
      }

      const wotConfig = getMetadataConfig(item, 'wot');
      const iotConfig = getMetadataConfig(item, 'iot');
      const protocolConfig = getMetadataConfig(item, 'interop');
      const sosaMetadata = getMetadata(item, 'sosa');
      const semanticTypes = dedupe([
        ...splitCsv(sosaMetadata ? sosaMetadata.value : ''),
        ...splitCsv(wotConfig.semanticTypes)
      ]);
      const propertyOps = splitCsv(
        wotConfig.propertyOps,
        parseBoolean(wotConfig.readOnly, true) ? ['readproperty'] : ['readproperty', 'writeproperty']
      );

      return {
        itemName: item.name,
        propertyName: wotConfig.propertyName || camelCaseFromItemName(item.name),
        title: wotConfig.title || cleanLabel(item.label, item.name),
        description: wotConfig.description || '',
        type: wotConfig.schemaType || inferSchemaType(item.type),
        unit: wotConfig.unit || '',
        readOnly: parseBoolean(wotConfig.readOnly, true),
        observable: parseBoolean(wotConfig.observable, true),
        semanticTypes,
        capability: iotConfig.capability || '',
        location: iotConfig.location || thingConfig.location,
        protocolMappings: buildProtocolMappings(protocolConfig),
        propertyForms: buildPropertyForms(thingConfig.baseUrl, item.name, propertyOps),
        actionName: wotConfig.actionName || '',
        actionTitle: wotConfig.actionTitle || '',
        actionDescription: wotConfig.actionDescription || '',
        actionInputType: wotConfig.actionInputType || '',
        actionMinimum: parseNumber(wotConfig.actionMinimum),
        actionMaximum: parseNumber(wotConfig.actionMaximum),
        actionSemanticTypes: dedupe(splitCsv(wotConfig.actionSemanticTypes, semanticTypes)),
        eventName: wotConfig.eventName || '',
        eventTitle: wotConfig.eventTitle || '',
        eventDescription: wotConfig.eventDescription || '',
        eventDataType: wotConfig.eventDataType || '',
        eventUnit: wotConfig.eventUnit || '',
        eventSemanticTypes: dedupe(splitCsv(wotConfig.eventSemanticTypes, semanticTypes))
      };
    })
    .filter((definition) => definition !== null);
}

function buildPropertyEntry(definition, includeContext) {
  const entry = {
    title: definition.title,
    type: definition.type,
    readOnly: definition.readOnly,
    observable: definition.observable,
    forms: definition.propertyForms
  };

  if (!isBlank(definition.description)) {
    entry.description = definition.description;
  }

  if (!isBlank(definition.unit)) {
    entry.unit = definition.unit;
  }

  addSemanticAnnotations(entry, definition, includeContext);
  return entry;
}

function buildActionEntry(definition, includeContext, baseUrl) {
  const entry = {
    title: definition.actionTitle || definition.title,
    forms: buildActionForm(baseUrl, definition.itemName)
  };

  if (!isBlank(definition.actionDescription)) {
    entry.description = definition.actionDescription;
  }

  if (!isBlank(definition.actionInputType)) {
    entry.input = {
      type: definition.actionInputType
    };

    if (definition.actionMinimum !== null) {
      entry.input.minimum = definition.actionMinimum;
    }

    if (definition.actionMaximum !== null) {
      entry.input.maximum = definition.actionMaximum;
    }
  }

  addSemanticAnnotations(entry, {
    ...definition,
    semanticTypes: definition.actionSemanticTypes
  }, includeContext);

  return entry;
}

function buildEventEntry(definition, includeContext, baseUrl) {
  const entry = {
    title: definition.eventTitle || definition.title,
    forms: buildEventForm(baseUrl, definition.itemName)
  };

  if (!isBlank(definition.eventDescription)) {
    entry.description = definition.eventDescription;
  }

  if (!isBlank(definition.eventDataType)) {
    entry.data = {
      type: definition.eventDataType
    };

    if (!isBlank(definition.eventUnit)) {
      entry.data.unit = definition.eventUnit;
    }
  }

  addSemanticAnnotations(entry, {
    ...definition,
    semanticTypes: definition.eventSemanticTypes
  }, includeContext);

  return entry;
}

function buildArtifactLinks(thingConfig, includeContext) {
  const selfHref = `${thingConfig.baseUrl}/rest/items/${includeContext ? OUTPUT_ITEMS.jsonLd : OUTPUT_ITEMS.json}/state`;
  const alternateHref = `${thingConfig.baseUrl}/rest/items/${includeContext ? OUTPUT_ITEMS.json : OUTPUT_ITEMS.jsonLd}/state`;

  return [
    {
      rel: 'self',
      href: selfHref,
      type: includeContext ? 'application/td+json' : 'application/json'
    },
    {
      rel: 'alternate',
      href: alternateHref,
      type: includeContext ? 'application/json' : 'application/td+json'
    },
    {
      rel: 'collection',
      href: `${thingConfig.baseUrl}/rest/items/${OUTPUT_ITEMS.directory}/state`,
      type: 'application/json'
    },
    {
      rel: 'context',
      href: `${thingConfig.baseUrl}/rest/items/${thingConfig.contextItem}/state`,
      type: 'application/ld+json'
    },
    {
      rel: 'validation',
      href: `${thingConfig.baseUrl}/rest/items/${OUTPUT_ITEMS.validationReport}/state`,
      type: 'application/json'
    },
    {
      rel: 'search',
      href: `${thingConfig.baseUrl}/rest/items/${OUTPUT_ITEMS.query}`,
      type: 'application/json'
    }
  ];
}

function buildTd(includeContext, thingConfig, definitions) {
  const td = {
    id: thingConfig.thingId,
    title: thingConfig.title,
    description: thingConfig.description,
    base: thingConfig.baseUrl,
    securityDefinitions: {
      [thingConfig.securityName]: {
        scheme: thingConfig.securityScheme
      }
    },
    security: [thingConfig.securityName],
    profile: thingConfig.profile,
    properties: {},
    actions: {},
    events: {},
    links: buildArtifactLinks(thingConfig, includeContext)
  };

  if (includeContext) {
    td['@context'] = [
      'https://www.w3.org/2019/wot/td/v1',
      'https://www.w3.org/ns/ssn/',
      'https://www.w3.org/ns/sosa/',
      `${thingConfig.baseUrl}/rest/items/${thingConfig.contextItem}/state`
    ];
    td['@type'] = thingConfig.types;
  } else {
    td.type = thingConfig.types;
  }

  definitions.forEach((definition) => {
    td.properties[definition.propertyName] = buildPropertyEntry(definition, includeContext);

    if (!isBlank(definition.actionName)) {
      td.actions[definition.actionName] = buildActionEntry(definition, includeContext, thingConfig.baseUrl);
    }

    if (!isBlank(definition.eventName)) {
      td.events[definition.eventName] = buildEventEntry(definition, includeContext, thingConfig.baseUrl);
    }
  });

  return JSON.stringify(td, null, 2);
}

function validateTdArtifacts(tdJsonLdString, tdJsonString, directoryString, contextString) {
  const errors = [];
  const warnings = [];

  const tdJsonLd = parseJson(tdJsonLdString, null, OUTPUT_ITEMS.jsonLd);
  const tdJson = parseJson(tdJsonString, null, OUTPUT_ITEMS.json);
  const directory = parseJson(directoryString, [], OUTPUT_ITEMS.directory);
  const context = parseJson(contextString, null, OUTPUT_ITEMS.context);

  if (!tdJsonLd) {
    errors.push('JSON-LD TD is not valid JSON');
  }

  if (!tdJson) {
    errors.push('Plain JSON TD is not valid JSON');
  }

  if (!context || !context['@context']) {
    errors.push('JSON-LD context document is missing @context');
  }

  if (!Array.isArray(directory) || directory.length === 0) {
    errors.push('TD directory is empty');
  }

  [tdJsonLd, tdJson].forEach((td, index) => {
    const label = index === 0 ? 'JSON-LD TD' : 'JSON TD';

    if (!td) {
      return;
    }

    if (isBlank(td.id)) {
      errors.push(`${label}: missing id`);
    }

    if (isBlank(td.title)) {
      errors.push(`${label}: missing title`);
    }

    if (!td.securityDefinitions || Object.keys(td.securityDefinitions).length === 0) {
      errors.push(`${label}: missing securityDefinitions`);
    }

    if (!Array.isArray(td.security) || td.security.length === 0) {
      errors.push(`${label}: missing security entries`);
    }

    if (!td.properties || Object.keys(td.properties).length === 0) {
      errors.push(`${label}: no properties generated`);
    }

    Object.entries(td.properties || {}).forEach(([name, property]) => {
      if (!Array.isArray(property.forms) || property.forms.length === 0) {
        errors.push(`${label}: property ${name} has no forms`);
      }
    });

    Object.entries(td.actions || {}).forEach(([name, action]) => {
      if (!Array.isArray(action.forms) || action.forms.length === 0) {
        errors.push(`${label}: action ${name} has no forms`);
      }
    });

    Object.entries(td.events || {}).forEach(([name, event]) => {
      if (!Array.isArray(event.forms) || event.forms.length === 0) {
        errors.push(`${label}: event ${name} has no forms`);
      }
    });

    if (index === 0 && !Array.isArray(td['@context'])) {
      errors.push('JSON-LD TD: missing @context array');
    }

    if (index === 1 && !Array.isArray(td.type)) {
      warnings.push('JSON TD: root type is not an array');
    }
  });

  const firstDirectoryEntry = Array.isArray(directory) && directory.length > 0 ? directory[0] : null;

  if (firstDirectoryEntry) {
    if (!Array.isArray(firstDirectoryEntry.links) || firstDirectoryEntry.links.length < 2) {
      errors.push('TD directory entry has insufficient discovery links');
    }
  }

  return {
    status: errors.length === 0 ? 'VALID' : 'INVALID',
    generatedAt: new Date().toISOString(),
    errors,
    warnings
  };
}

function buildDirectory(thingConfig, definitions, validationReport) {
  const capabilities = dedupe(definitions.map((definition) => definition.capability));

  return JSON.stringify([
    {
      id: thingConfig.thingId,
      title: thingConfig.title,
      description: thingConfig.description,
      types: thingConfig.types,
      location: thingConfig.location,
      capabilities,
      validationStatus: validationReport.status,
      validated: validationReport.status === 'VALID',
      links: [
        {
          rel: 'td',
          href: `${thingConfig.baseUrl}/rest/items/${OUTPUT_ITEMS.jsonLd}/state`,
          type: 'application/td+json'
        },
        {
          rel: 'td:json',
          href: `${thingConfig.baseUrl}/rest/items/${OUTPUT_ITEMS.json}/state`,
          type: 'application/json'
        },
        {
          rel: 'context',
          href: `${thingConfig.baseUrl}/rest/items/${OUTPUT_ITEMS.context}/state`,
          type: 'application/ld+json'
        },
        {
          rel: 'validation',
          href: `${thingConfig.baseUrl}/rest/items/${OUTPUT_ITEMS.validationReport}/state`,
          type: 'application/json'
        },
        {
          rel: 'search',
          href: `${thingConfig.baseUrl}/rest/items/${OUTPUT_ITEMS.query}`,
          type: 'application/json'
        }
      ]
    }
  ], null, 2);
}

function matches(value, expected) {
  if (isBlank(expected)) {
    return true;
  }

  if (isBlank(value)) {
    return false;
  }

  return String(value).toLowerCase().includes(String(expected).toLowerCase());
}

function matchesValidated(entry, expected) {
  if (expected === undefined || expected === null || String(expected).trim() === '') {
    return true;
  }

  const expectedBoolean = parseBoolean(expected, null);

  if (expectedBoolean === null) {
    return matches(entry.validationStatus, expected);
  }

  return Boolean(entry.validated) === expectedBoolean;
}

function filterDirectory(directoryJson, queryJson) {
  const directory = parseJson(directoryJson, [], OUTPUT_ITEMS.directory);
  const query = parseJson(queryJson, {}, OUTPUT_ITEMS.query);

  const filtered = directory.filter((entry) => {
    const types = Array.isArray(entry.types) ? entry.types.join(' ') : '';
    const capabilities = Array.isArray(entry.capabilities) ? entry.capabilities.join(' ') : '';

    return matches(types, query.type) &&
      matches(entry.location, query.location) &&
      matches(capabilities, query.capability) &&
      matchesValidated(entry, query.validated);
  });

  return JSON.stringify(filtered, null, 2);
}

function updateTdArtifacts() {
  seedSemanticMetadata();
  const thingConfig = getThingConfig();
  const definitions = buildAffordanceDefinitions(thingConfig);
  const contextString = JSON.stringify(DEFAULT_CONTEXT_DOCUMENT, null, 2);
  const tdJsonLd = buildTd(true, thingConfig, definitions);
  const tdJson = buildTd(false, thingConfig, definitions);
  const provisionalValidation = validateTdArtifacts(tdJsonLd, tdJson, '[]', contextString);
  const directory = buildDirectory(thingConfig, definitions, provisionalValidation);
  const validationReport = validateTdArtifacts(tdJsonLd, tdJson, directory, contextString);
  const validationString = JSON.stringify(validationReport, null, 2);
  const finalDirectory = buildDirectory(thingConfig, definitions, validationReport);

  items.getItem(OUTPUT_ITEMS.context).postUpdate(contextString);
  items.getItem(OUTPUT_ITEMS.jsonLd).postUpdate(tdJsonLd);
  items.getItem(OUTPUT_ITEMS.json).postUpdate(tdJson);
  items.getItem(OUTPUT_ITEMS.directory).postUpdate(finalDirectory);
  items.getItem(OUTPUT_ITEMS.validationStatus).postUpdate(validationReport.status);
  items.getItem(OUTPUT_ITEMS.validationReport).postUpdate(validationString);
}

function refreshDirectorySearch() {
  const directoryJson = items.getItem(OUTPUT_ITEMS.directory).state.toString();
  const queryState = items.getItem(OUTPUT_ITEMS.query).state;
  const queryJson = isBlank(queryState) ? '{}' : queryState.toString();

  items.getItem(OUTPUT_ITEMS.result).postUpdate(filterDirectory(directoryJson, queryJson));
}

rules.JSRule({
  id: 'wot-td-generate-on-startup',
  name: 'WoT TD generate on startup',
  description: 'Generate TD artifacts from OpenHAB semantic metadata on startup.',
  triggers: [
    triggers.SystemStartlevelTrigger(100)
  ],
  execute: () => {
    updateTdArtifacts();
    refreshDirectorySearch();
  }
});

rules.JSRule({
  id: 'wot-td-regenerate-on-gateway-change',
  name: 'WoT TD regenerate on gateway change',
  description: 'Refresh TD artifacts when annotated gateway items change.',
  triggers: [
    triggers.ItemStateChangeTrigger('Gateway_Temperature'),
    triggers.ItemStateChangeTrigger('Gateway_Humidity'),
    triggers.ItemStateChangeTrigger('Gateway_Light'),
    triggers.ItemStateChangeTrigger('Gateway_Dimmer'),
    triggers.ItemStateChangeTrigger('Gateway_Battery'),
    triggers.ItemStateChangeTrigger('Gateway_LQI')
  ],
  execute: () => {
    updateTdArtifacts();
    refreshDirectorySearch();
  }
});

rules.JSRule({
  id: 'wot-td-directory-search',
  name: 'WoT TD directory search',
  description: 'Filter the TD directory when a query item is updated.',
  triggers: [
    triggers.ItemStateUpdateTrigger(OUTPUT_ITEMS.query),
    triggers.ItemCommandTrigger(OUTPUT_ITEMS.query)
  ],
  execute: () => {
    refreshDirectorySearch();
  }
});
