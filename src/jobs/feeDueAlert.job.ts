// import cron from 'node-cron';
// import type { FastifyInstance } from 'fastify';
// import { FeeService } from '../app/modules/fee/fee.service.js';

// export const startFeeDueAlertCron = (fastify: FastifyInstance) => {
//   if (process.env.NODE_ENV === 'development') {
//     console.log('⏭️ Fee Due Alert Cron skipped in development');
//     return;
//   }

//   cron.schedule(
//     '0 9 * * *',
//     async () => {
//       console.log('🕘 Running Fee Due Alert Cron...');
//       try {
//         const result = await FeeService.sendDueAlerts(fastify);
//         console.log('✅ Due Alert Result:', result);
//       } catch (error) {
//         console.error('❌ Due Alert Cron Failed:', error);
//       }
//     },
//     {
//       timezone: 'Asia/Dhaka',
//     }
//   );

//   console.log('📅 Fee Due Alert Cron scheduled (Everyday 9:00 AM Asia/Dhaka)');
// };