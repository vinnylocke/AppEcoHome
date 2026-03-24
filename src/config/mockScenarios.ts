import { Location, WeatherData, GardenTask, InventoryItem } from '../types';

export interface MockScenario {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  location?: Location;
  weather?: WeatherData;
  tasks?: GardenTask[];
  inventory?: InventoryItem[];
}

export const MOCK_SCENARIOS: MockScenario[] = [
  {
    id: 'mock-heavy-rain',
    name: 'Heavy Rain Expected',
    description: 'Tests if the app postpones watering tasks when heavy rain is expected.',
    enabled: false,
    weather: {
      temp: 15,
      condition: 'Rain',
      rainExpected: true,
      rainAmount: 25,
      isFrostWarning: false,
      humidity: 90,
      windSpeed: 15,
      dewPoint: 12,
      uvIndex: 2,
      pressure: 1005,
      forecast: [],
      todayWarnings: {
        frost: { active: false },
        heat: { active: false },
        wind: { active: false },
        rain: { active: true, timePeriod: '08:00 - 14:00', amount: 25 },
      },
      tomorrowWarnings: {
        frost: { active: false },
        heat: { active: false },
        wind: { active: false },
        rain: { active: true, timePeriod: '10:00 - 16:00', amount: 15 },
      },
      nextDayWarnings: {
        frost: { active: false },
        heat: { active: false },
        wind: { active: false },
        rain: { active: true, timePeriod: '10:00 - 16:00', amount: 15 },
      }
    }
  },
  {
    id: 'mock-2day-frost',
    name: '2-Day Frost Warning',
    description: 'Tests if the app shows separate alerts for frost today and tomorrow.',
    enabled: false,
    weather: {
      temp: -1,
      condition: 'Clear',
      rainExpected: false,
      rainAmount: 0,
      isFrostWarning: true,
      humidity: 70,
      windSpeed: 5,
      dewPoint: -4,
      uvIndex: 1,
      pressure: 1020,
      forecast: [],
      todayWarnings: {
        frost: { active: true, timePeriod: '22:00 - 23:59' },
        heat: { active: false },
        wind: { active: false },
        rain: { active: false },
      },
      tomorrowWarnings: {
        frost: { active: true, timePeriod: '00:00 - 08:00' },
        heat: { active: false },
        wind: { active: false },
        rain: { active: false },
      },
      nextDayWarnings: {
        frost: { active: true, timePeriod: '00:00 - 08:00' },
        heat: { active: false },
        wind: { active: false },
        rain: { active: false },
      }
    }
  },
  {
    id: 'mock-overdue-duplicate',
    name: 'Overdue Duplicate Task',
    description: 'Simulates a plant having both an overdue watering task and a task due today.',
    enabled: false,
    inventory: [
      {
        id: 'mock-item-duplicate',
        plantId: 'tomato-id',
        plantName: 'Test Tomato',
        locationId: 'mock-loc-rain-dup',
        status: 'Planted',
        plantedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        environment: 'Outdoors'
      }
    ],
    location: {
      id: 'mock-loc-rain-dup',
      name: 'Test Garden (Mock)',
      address: '123 Test St',
      lat: 51.5074,
      lng: -0.1278,
      createdAt: new Date().toISOString()
    },
    tasks: [
      {
        id: 'mock-task-yesterday',
        inventoryItemId: 'mock-item-duplicate',
        title: 'Water Test Tomato (Overdue)',
        description: 'This task was due yesterday.',
        type: 'Watering',
        status: 'Pending',
        dueDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: 'mock-task-today',
        inventoryItemId: 'mock-item-duplicate',
        title: 'Water Test Tomato (Today)',
        description: 'This task is due today.',
        type: 'Watering',
        status: 'Pending',
        dueDate: new Date().toISOString()
      }
    ]
  },
  {
    id: 'mock-extreme-wind',
    name: 'Extreme Winds (Storm)',
    description: 'Tests if the app warns to secure plants during storm-level winds (89+ kph).',
    enabled: false,
    weather: {
      temp: 18,
      condition: 'Cloudy',
      rainExpected: false,
      rainAmount: 0,
      isFrostWarning: false,
      humidity: 60,
      windSpeed: 95,
      dewPoint: 10,
      uvIndex: 4,
      pressure: 990,
      forecast: [],
      todayWarnings: {
        frost: { active: false },
        heat: { active: false },
        wind: { 
          active: true, 
          timePeriod: '08:00 - 12:00', 
          maxSpeed: 95,
          severity: 'Extreme',
          description: 'Storm. Trees are uprooted; considerable structural damage.'
        },
        rain: { active: false },
      },
      tomorrowWarnings: {
        frost: { active: false },
        heat: { active: false },
        wind: { 
          active: true, 
          timePeriod: '12:00 - 18:00', 
          maxSpeed: 85,
          severity: 'High',
          description: 'Near Gale. Whole trees in motion.'
        },
        rain: { active: false },
      },
      nextDayWarnings: {
        frost: { active: false },
        heat: { active: false },
        wind: { 
          active: true, 
          timePeriod: '12:00 - 18:00', 
          maxSpeed: 85,
          severity: 'High',
          description: 'Near Gale. Whole trees in motion.'
        },
        rain: { active: false },
      }
    }
  },
  {
    id: 'mock-fresh-breeze',
    name: 'Fresh Breeze',
    description: 'Tests if the app warns during fresh breezes (29-49 kph).',
    enabled: false,
    weather: {
      temp: 22,
      condition: 'Clear',
      rainExpected: false,
      rainAmount: 0,
      isFrostWarning: false,
      humidity: 50,
      windSpeed: 35,
      dewPoint: 12,
      uvIndex: 6,
      pressure: 1012,
      forecast: [],
      nextDayWarnings: {
        frost: { active: false },
        heat: { active: false },
        wind: { 
          active: true, 
          timePeriod: '14:00 - 20:00', 
          maxSpeed: 35,
          severity: 'Moderate to Strong',
          description: 'Fresh Breeze. Small trees in leaf begin to sway.'
        },
        rain: { active: false },
      }
    }
  },
  {
    id: 'mock-freezing',
    name: 'Freezing Conditions',
    description: 'Tests if the app warns to protect young plants during frost.',
    enabled: false,
    weather: {
      temp: -2,
      condition: 'Snow',
      rainExpected: false,
      rainAmount: 0,
      isFrostWarning: true,
      humidity: 80,
      windSpeed: 10,
      dewPoint: -5,
      uvIndex: 1,
      pressure: 1015,
      forecast: [],
      nextDayWarnings: {
        frost: { active: true, timePeriod: '02:00 - 08:00' },
        heat: { active: false },
        wind: { active: false },
        rain: { active: false },
      }
    }
  },
  {
    id: 'mock-rainy-watering',
    name: 'Watering on Rainy Day',
    description: 'Simulates a watering task due today on a day where rain is expected, testing the auto-postpone/complete logic.',
    enabled: false,
    location: {
      id: 'mock-loc-rainy-day',
      name: 'Test Garden (Rainy)',
      address: 'Rainy Lane',
      lat: 51.5074,
      lng: -0.1278,
      createdAt: new Date().toISOString()
    },
    weather: {
      temp: 14,
      condition: 'Rain',
      rainExpected: true,
      rainAmount: 15,
      isFrostWarning: false,
      humidity: 85,
      windSpeed: 12,
      dewPoint: 10,
      uvIndex: 2,
      pressure: 1008,
      forecast: [],
      nextDayWarnings: {
        frost: { active: false },
        heat: { active: false },
        wind: { active: false },
        rain: { active: true, timePeriod: '09:00 - 15:00', amount: 15 },
      }
    },
    inventory: [
      {
        id: 'mock-item-rainy',
        plantId: 'mint-id',
        plantName: 'Rainy Mint',
        locationId: 'mock-loc-rainy-day',
        status: 'Planted',
        plantedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        environment: 'Outdoors'
      }
    ],
    tasks: [
      {
        id: 'mock-task-rainy',
        inventoryItemId: 'mock-item-rainy',
        title: 'Water Rainy Mint',
        description: 'Should be handled by rain logic.',
        type: 'Watering',
        status: 'Pending',
        dueDate: new Date().toISOString()
      }
    ]
  }
];
