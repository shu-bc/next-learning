import { sql } from '@vercel/postgres';
import {
  CustomerField,
  CustomersTableType,
  InvoiceForm,
  InvoicesTable,
} from './definitions';
import { formatCurrency } from './utils';
import { prisma } from './prisma';
import { LatestInvoice } from './definitions';

export async function fetchRevenue() {
  const revenue = await prisma.revenue.findMany();

  return revenue
}

export async function fetchLatestInvoices() {
  const raw = await prisma.invoice.findMany({
    include: {
      customer: true
    },
    orderBy: {
      date: 'desc'
    },
    take: 5
  })

  const latestInvoices:LatestInvoice[] = raw.map(invoice => ({
    id: invoice.id,
    name: invoice.customer.name,
    image_url: invoice.customer.image_url,
    email: invoice.customer.email,
    amount: formatCurrency(invoice.amount)
  }))

  return latestInvoices
}

export async function fetchCardData() {
  const numberOfCustomersPromise = prisma.customer.count();
  const numberOfInvoicesPromise = prisma.invoice.count();
  const invoiceStatusPromise = prisma.invoice.groupBy({
    by: ['status'],
    _sum: {
      amount: true
    },
    where: {
      status: {
        in: ['paid', 'pending']
      }
    }
  })

  const data = await Promise.all([
    numberOfCustomersPromise,
    numberOfInvoicesPromise,
    invoiceStatusPromise
  ]);

  return {
    numberOfCustomers: data[0],
    numberOfInvoices: data[1],
    totalPaidInvoices: formatCurrency(data[2].find(status => status.status === 'paid')?._sum.amount ?? 0),
    totalPendingInvoices: formatCurrency(data[2].find(status => status.status === 'pending')?._sum.amount ?? 0)
  }

  // try {
  //   // You can probably combine these into a single SQL query
  //   // However, we are intentionally splitting them to demonstrate
  //   // how to initialize multiple queries in parallel with JS.
  //   const invoiceCountPromise = sql`SELECT COUNT(*) FROM invoices`;
  //   const customerCountPromise = sql`SELECT COUNT(*) FROM customers`;
  //   const invoiceStatusPromise = sql`SELECT
  //        SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) AS "paid",
  //        SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) AS "pending"
  //        FROM invoices`;
  //
  //   const data = await Promise.all([
  //     invoiceCountPromise,
  //     customerCountPromise,
  //     invoiceStatusPromise,
  //   ]);
  //
  //   const numberOfInvoices = Number(data[0].rows[0].count ?? '0');
  //   const numberOfCustomers = Number(data[1].rows[0].count ?? '0');
  //   const totalPaidInvoices = formatCurrency(data[2].rows[0].paid ?? '0');
  //   const totalPendingInvoices = formatCurrency(data[2].rows[0].pending ?? '0');
  //
  //   return {
  //     numberOfCustomers,
  //     numberOfInvoices,
  //     totalPaidInvoices,
  //     totalPendingInvoices,
  //   };
  // } catch (error) {
  //   console.error('Database Error:', error);
  //   throw new Error('Failed to fetch card data.');
  // }
}

const ITEMS_PER_PAGE = 6;
export async function fetchFilteredInvoices(
  query: string,
  currentPage: number,
) {
  const offset = (currentPage - 1) * ITEMS_PER_PAGE;

  try {
    const invoices = await sql<InvoicesTable>`
      SELECT
        invoices.id,
        invoices.amount,
        invoices.date,
        invoices.status,
        customers.name,
        customers.email,
        customers.image_url
      FROM invoices
      JOIN customers ON invoices.customer_id = customers.id
      WHERE
        customers.name ILIKE ${`%${query}%`} OR
        customers.email ILIKE ${`%${query}%`} OR
        invoices.amount::text ILIKE ${`%${query}%`} OR
        invoices.date::text ILIKE ${`%${query}%`} OR
        invoices.status ILIKE ${`%${query}%`}
      ORDER BY invoices.date DESC
      LIMIT ${ITEMS_PER_PAGE} OFFSET ${offset}
    `;

    return invoices.rows;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch invoices.');
  }
}

export async function fetchInvoicesPages(query: string) {
  try {
    const count = await sql`SELECT COUNT(*)
    FROM invoices
    JOIN customers ON invoices.customer_id = customers.id
    WHERE
      customers.name ILIKE ${`%${query}%`} OR
      customers.email ILIKE ${`%${query}%`} OR
      invoices.amount::text ILIKE ${`%${query}%`} OR
      invoices.date::text ILIKE ${`%${query}%`} OR
      invoices.status ILIKE ${`%${query}%`}
  `;

    const totalPages = Math.ceil(Number(count.rows[0].count) / ITEMS_PER_PAGE);
    return totalPages;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch total number of invoices.');
  }
}

export async function fetchInvoiceById(id: string) {
  try {
    const data = await sql<InvoiceForm>`
      SELECT
        invoices.id,
        invoices.customer_id,
        invoices.amount,
        invoices.status
      FROM invoices
      WHERE invoices.id = ${id};
    `;

    const invoice = data.rows.map((invoice) => ({
      ...invoice,
      // Convert amount from cents to dollars
      amount: invoice.amount / 100,
    }));

    return invoice[0];
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch invoice.');
  }
}

export async function fetchCustomers() {
  try {
    const data = await sql<CustomerField>`
      SELECT
        id,
        name
      FROM customers
      ORDER BY name ASC
    `;

    const customers = data.rows;
    return customers;
  } catch (err) {
    console.error('Database Error:', err);
    throw new Error('Failed to fetch all customers.');
  }
}

export async function fetchFilteredCustomers(query: string) {
  try {
    const data = await sql<CustomersTableType>`
		SELECT
		  customers.id,
		  customers.name,
		  customers.email,
		  customers.image_url,
		  COUNT(invoices.id) AS total_invoices,
		  SUM(CASE WHEN invoices.status = 'pending' THEN invoices.amount ELSE 0 END) AS total_pending,
		  SUM(CASE WHEN invoices.status = 'paid' THEN invoices.amount ELSE 0 END) AS total_paid
		FROM customers
		LEFT JOIN invoices ON customers.id = invoices.customer_id
		WHERE
		  customers.name ILIKE ${`%${query}%`} OR
        customers.email ILIKE ${`%${query}%`}
		GROUP BY customers.id, customers.name, customers.email, customers.image_url
		ORDER BY customers.name ASC
	  `;

    const customers = data.rows.map((customer) => ({
      ...customer,
      total_pending: formatCurrency(customer.total_pending),
      total_paid: formatCurrency(customer.total_paid),
    }));

    return customers;
  } catch (err) {
    console.error('Database Error:', err);
    throw new Error('Failed to fetch customer table.');
  }
}
