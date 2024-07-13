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
import { countReset } from 'console';

export async function fetchRevenue() {
  console.log('Fetching revenue data...');
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const revenue = await prisma.revenue.findMany();

   console.log('Data fetch completed after 3 seconds.');

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
}

const ITEMS_PER_PAGE = 6;
export async function fetchFilteredInvoices(
  query: string,
  currentPage: number,
): Promise<InvoicesTable[]> {
  const offset = (currentPage - 1) * ITEMS_PER_PAGE;

  const result = await prisma.$queryRaw<InvoicesTable[]>`
      SELECT
        i.id as id,
        i.amount as amount,
        i.date as date,
        i.status as status,
        c.name as name,
        c.email as email,
        c.image_url as image_url
      FROM "Invoice" i
      JOIN "Customer" c ON i.customer_id = c.id
      WHERE
        c.name ILIKE ${`%${query}%`} OR
        c.email ILIKE ${`%${query}%`} OR
        i.amount::text ILIKE ${`%${query}%`} OR
        i.date::text ILIKE ${`%${query}%`} OR
        i.status ILIKE ${`%${query}%`}
      ORDER BY i.date DESC
      LIMIT ${ITEMS_PER_PAGE} OFFSET ${offset}
  `

  return result
}

export async function fetchInvoicesPages(query: string) {
  const countResult = await prisma.$queryRaw<{count: Number}[]>`
    SELECT COUNT(*)
        FROM "Invoice" i
        JOIN "Customer" c ON i.customer_id = c.id
        WHERE
          c.name ILIKE ${`%${query}%`} OR
          c.email ILIKE ${`%${query}%`} OR
          i.amount::text ILIKE ${`%${query}%`} OR
          i.date::text ILIKE ${`%${query}%`} OR
          i.status ILIKE ${`%${query}%`}
  `

  const totalPages = Math.ceil(Number(countResult[0].count) / ITEMS_PER_PAGE);
  return totalPages;
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
