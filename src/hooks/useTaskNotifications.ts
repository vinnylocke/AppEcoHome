import { useEffect } from 'react';
import { GardenTask, WeatherAlert } from '../types';

export const useTaskNotifications = (tasks: GardenTask[], intervalHours: number = 8, weatherAlerts: WeatherAlert[] = []) => {
  useEffect(() => {
    if (!('Notification' in window)) return;

    // Request permission if not asked yet
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }

    const checkAndNotify = () => {
      if (Notification.permission !== 'granted') return;

      const now = Date.now();
      const intervalMs = intervalHours * 60 * 60 * 1000;

      // 1. Task Notifications
      const nowTime = new Date();
      const today = new Date(nowTime.getFullYear(), nowTime.getMonth(), nowTime.getDate());

      const pendingTasks = tasks.filter(t => {
        if (t.status !== 'Pending') return false;
        const taskDate = new Date(t.dueDate);
        const taskDay = new Date(taskDate.getFullYear(), taskDate.getMonth(), taskDate.getDate());
        return taskDay <= today;
      });

      // Deduplicate tasks for the same plant and type
      const deduplicatedTasks = pendingTasks.reduce((acc: GardenTask[], current) => {
        // For pending tasks, only keep the oldest one for this plant and type
        const existingPendingIndex = acc.findIndex(item => 
          item.inventoryItemId === current.inventoryItemId && 
          item.type === current.type
        );
        
        if (existingPendingIndex >= 0) {
          const existing = acc[existingPendingIndex];
          if (new Date(current.dueDate).getTime() < new Date(existing.dueDate).getTime()) {
            acc[existingPendingIndex] = current;
          }
        } else {
          acc.push(current);
        }
        return acc;
      }, []);

      if (deduplicatedTasks.length > 0) {
        const lastNotified = localStorage.getItem('lastTaskNotification');
        if (!lastNotified || now - parseInt(lastNotified, 10) >= intervalMs) {
          const notification = new Notification('EcoHome Tasks Pending', {
            body: `You have ${deduplicatedTasks.length} pending garden task${deduplicatedTasks.length > 1 ? 's' : ''} to take care of.`,
            icon: '/favicon.ico'
          });
          setTimeout(() => notification.close(), 5000);
          localStorage.setItem('lastTaskNotification', now.toString());
        }
      }

      // 2. Weather Alert Notifications
      weatherAlerts.forEach(alert => {
        const alertKey = `weatherAlert-${alert.id}`;
        const lastAlerted = localStorage.getItem(alertKey);
        
        // Alert once every 12 hours for the same weather condition
        if (!lastAlerted || now - parseInt(lastAlerted, 10) >= 12 * 60 * 60 * 1000) {
          const notification = new Notification(`EcoHome Weather Alert: ${alert.locationName}`, {
            body: alert.message,
            icon: '/favicon.ico'
          });
          setTimeout(() => notification.close(), 8000);
          localStorage.setItem(alertKey, now.toString());
        }
      });
    };

    // Check immediately on mount/update
    checkAndNotify();

    // Then check periodically (every minute)
    const intervalId = setInterval(checkAndNotify, 60 * 1000);

    return () => clearInterval(intervalId);
  }, [tasks, intervalHours, weatherAlerts]);
};
