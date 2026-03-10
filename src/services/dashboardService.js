import mongoose from 'mongoose';

const getInvoiceStats = async (organizationId) => {
  const Invoice = mongoose.model('Invoice');

  const [result] = await Invoice.aggregate([
    { $match: { organizationId } },
    {
      $group: {
        _id: null,
        totalInvoices: { $sum: 1 },
        totalRevenue: {
          $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$total', 0] }
        },
        paidInvoices: {
          $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] }
        },
        pendingInvoices: {
          $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] }
        },
        overdueInvoices: {
          $sum: { $cond: [{ $eq: ['$status', 'overdue'] }, 1, 0] }
        }
      }
    },
    {
      $project: {
        _id: 0,
        totalInvoices: 1,
        totalRevenue: 1,
        paidInvoices: 1,
        pendingInvoices: 1,
        overdueInvoices: 1
      }
    }
  ]);

  return result ?? {
    totalInvoices: 0,
    totalRevenue: 0,
    paidInvoices: 0,
    pendingInvoices: 0,
    overdueInvoices: 0
  };
};

const getTotalClients = async (organizationId) => {
  const Client = mongoose.model('Client');
  return Client.countDocuments({ organizationId });
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const getMonthlyRevenue = async (organizationId) => {
  const Invoice = mongoose.model('Invoice');

  const rows = await Invoice.aggregate([
    {
      $match: {
        organizationId,
        status: 'paid',
        paidAt: { $ne: null, $type: 'date' }
      }
    },
    {
      $group: {
        _id: {
          year: { $year: '$paidAt' },
          month: { $month: '$paidAt' }
        },
        revenue: { $sum: '$total' }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } },
    {
      $project: {
        _id: 0,
        year: '$_id.year',
        month: '$_id.month',
        revenue: 1
      }
    }
  ]);

  return rows.map(({ year, month, revenue }) => ({
    month: `${MONTH_NAMES[month - 1]} ${year}`,
    revenue
  }));
};

export const getInvoiceStatusStats = async (organizationId) => {
  const Invoice = mongoose.model('Invoice');

  const TRACKED_STATUSES = ['paid', 'sent', 'overdue'];

  const rows = await Invoice.aggregate([
    { $match: { organizationId, status: { $in: TRACKED_STATUSES } } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
    { $project: { _id: 0, status: '$_id', count: 1 } }
  ]);

  const defaults = { paid: 0, pending: 0, overdue: 0 };

  return rows.reduce((acc, { status, count }) => {
    const key = status === 'sent' ? 'pending' : status;
    acc[key] = count;
    return acc;
  }, defaults);
};

export const getTopClientsByRevenue = async (organizationId) => {
  const Invoice = mongoose.model('Invoice');

  return Invoice.aggregate([
    { $match: { organizationId, status: 'paid' } },
    {
      $group: {
        _id: '$clientId',
        revenue: { $sum: '$total' }
      }
    },
    { $sort: { revenue: -1 } },
    { $limit: 5 },
    {
      $lookup: {
        from: 'clients',
        localField: '_id',
        foreignField: 'id',
        as: 'client'
      }
    },
    { $unwind: { path: '$client', preserveNullAndEmptyArrays: false } },
    {
      $project: {
        _id: 0,
        clientId: '$_id',
        name: '$client.name',
        email: '$client.email',
        company: '$client.company',
        revenue: 1
      }
    }
  ]);
};

export const getRecentInvoices = async (organizationId) => {
  const Invoice = mongoose.model('Invoice');

  return Invoice.aggregate([
    { $match: { organizationId } },
    { $sort: { createdAt: -1 } },
    { $limit: 5 },
    {
      $lookup: {
        from: 'clients',
        localField: 'clientId',
        foreignField: 'id',
        as: 'client'
      }
    },
    {
      $unwind: { path: '$client', preserveNullAndEmptyArrays: true }
    },
    {
      $project: {
        _id: 0,
        invoiceNumber: 1,
        total: 1,
        status: 1,
        createdAt: 1,
        clientName: { $ifNull: ['$client.name', 'Unknown Client'] }
      }
    }
  ]);
};

export const getMonthlyGrowth = async (organizationId) => {
  const Client  = mongoose.model('Client');
  const Invoice = mongoose.model('Invoice');

  const monthBucket = {
    year:  { $year:  '$createdAt' },
    month: { $month: '$createdAt' }
  };

  const [clientRows, invoiceRows] = await Promise.all([
    Client.aggregate([
      { $match: { organizationId } },
      { $group: { _id: monthBucket, count: { $sum: 1 } } },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
      { $project: { _id: 0, year: '$_id.year', month: '$_id.month', count: 1 } }
    ]),
    Invoice.aggregate([
      { $match: { organizationId } },
      { $group: { _id: monthBucket, count: { $sum: 1 } } },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
      { $project: { _id: 0, year: '$_id.year', month: '$_id.month', count: 1 } }
    ])
  ]);

  // Build a merged map keyed by "YYYY-MM" so both series align on the same months
  const map = new Map();

  const key = (year, month) => `${year}-${String(month).padStart(2, '0')}`;

  for (const { year, month, count } of clientRows) {
    const k = key(year, month);
    map.set(k, { year, month, clientsAdded: count, invoicesCreated: 0 });
  }

  for (const { year, month, count } of invoiceRows) {
    const k = key(year, month);
    if (map.has(k)) {
      map.get(k).invoicesCreated = count;
    } else {
      map.set(k, { year, month, clientsAdded: 0, invoicesCreated: count });
    }
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([, { year, month, clientsAdded, invoicesCreated }]) => ({
      month: `${MONTH_NAMES[month - 1]} ${year}`,
      clientsAdded,
      invoicesCreated
    }));
};

export const getAverageInvoiceValue = async (organizationId) => {
  const Invoice = mongoose.model('Invoice');

  const [result] = await Invoice.aggregate([
    { $match: { organizationId, status: 'paid' } },
    {
      $group: {
        _id: null,
        totalSum: { $sum: '$total' },
        count:    { $sum: 1 }
      }
    },
    {
      $project: {
        _id: 0,
        averageInvoiceValue: {
          $cond: [{ $eq: ['$count', 0] }, 0, { $divide: ['$totalSum', '$count'] }]
        }
      }
    }
  ]);

  return result ?? { averageInvoiceValue: 0 };
};

export const getClientLifetimeValue = async (organizationId) => {
  const Invoice = mongoose.model('Invoice');

  return Invoice.aggregate([
    { $match: { organizationId, status: 'paid' } },
    {
      $group: {
        _id: '$clientId',
        lifetimeRevenue: { $sum: '$total' },
        invoiceCount:    { $sum: 1 }
      }
    },
    { $sort: { lifetimeRevenue: -1 } },
    {
      $lookup: {
        from: 'clients',
        localField: '_id',
        foreignField: 'id',
        as: 'client'
      }
    },
    { $unwind: { path: '$client', preserveNullAndEmptyArrays: false } },
    {
      $project: {
        _id: 0,
        clientId:        '$_id',
        name:            '$client.name',
        email:           '$client.email',
        company:         '$client.company',
        lifetimeRevenue: 1,
        invoiceCount:    1
      }
    }
  ]);
};

export const getDashboardStats = async (organizationId) => {
  const [totalClients, invoiceStats] = await Promise.all([
    getTotalClients(organizationId),
    getInvoiceStats(organizationId)
  ]);

  return {
    totalClients,
    ...invoiceStats
  };
};
