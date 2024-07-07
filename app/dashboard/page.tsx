import { PrismaClient } from "@prisma/client"

export default async function Page() {
  const prisma = new PrismaClient()

  const customers = await prisma.customer.findMany()

  return (
    <div>
      <p>Dashboard Page</p>
      {
        customers.map((customer) => (
          <div key={customer.id}>
            <p>{customer.name}</p>
            <p>{customer.email}</p>
            <img src={customer.image_url} alt={customer.name} />
          </div>
        ))
      }
    </div>
  )
}
