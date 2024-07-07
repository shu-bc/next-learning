import { PrismaClient } from '@prisma/client';
import { invoices, customers, revenue, users } from './placeholder-data';

const prisma = new PrismaClient();

async function main() {
  await prisma.revenue.deleteMany()
  await prisma.invoice.deleteMany()
  await prisma.customer.deleteMany()
  await prisma.user.deleteMany()

  users.forEach(async (user) => {
    await prisma.user.create({
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        password: user.password
      }
    })
  })

  await Promise.all(
    customers.map(async (customer) => {
      await prisma.customer.create({
        data: {
          id: customer.id,
          name: customer.name,
          email: customer.email,
          image_url: customer.image_url
        }
      })
    })
  )

  await Promise.all(
    invoices.map(async (invoice) => {
      await prisma.invoice.create({
        data: {
          customer_id: invoice.customer_id,
          amount: invoice.amount,
          status: invoice.status,
          date: new Date(invoice.date)
        }
      })
    })
  )

  revenue.forEach(async (revenue) => {
    await prisma.revenue.create({
      data: {
        month: revenue.month,
        revenue: revenue.revenue
      }
    })
  })
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect();
    process.exit(1);
  })


