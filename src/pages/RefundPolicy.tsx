import { Navbar } from "@/components/layout/Navbar";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { FooterInfoBar } from "@/components/layout/FooterInfoBar";

const RefundPolicy = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 pt-20 pb-24 px-4">
        <div className="max-w-3xl mx-auto">
          <h1 className="font-heading text-3xl md:text-4xl text-foreground mb-6">
            REFUND &amp; CANCELLATION POLICY
          </h1>

          <p className="text-muted-foreground text-sm mb-8">
            Last updated: {new Date().toLocaleDateString('en-IE', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>

          <div className="space-y-8 text-foreground">
            <section>
              <h2 className="font-heading text-xl text-primary mb-3">1. OVERVIEW</h2>
              <p className="text-muted-foreground leading-relaxed">
                At Street Eatz Waterford we take pride in serving fresh, made-to-order food. This policy explains
                when refunds and cancellations are possible, how to request one, and how long it will take.
                Nothing in this policy affects your statutory rights as a consumer under Irish or EU law.
              </p>
            </section>

            <section>
              <h2 className="font-heading text-xl text-primary mb-3">2. NO REFUNDS ONCE PREPARED</h2>
              <p className="text-muted-foreground leading-relaxed">
                Because all of our food is prepared fresh on receipt of your order, we are unable to cancel or refund
                an order once preparation has begun. Please double-check your order, customisations and contact details
                before confirming payment.
              </p>
            </section>

            <section>
              <h2 className="font-heading text-xl text-primary mb-3">3. WHEN REFUNDS APPLY</h2>
              <p className="text-muted-foreground leading-relaxed mb-2">
                We will issue a refund or replacement in the following cases:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li><strong className="text-foreground">Incorrect order</strong> &mdash; you received items that do not match what you ordered.</li>
                <li><strong className="text-foreground">Missing items</strong> &mdash; one or more items from your order were not provided.</li>
                <li><strong className="text-foreground">Faulty or unsafe food</strong> &mdash; the food was not fit for consumption (e.g. undercooked or spoiled).</li>
              </ul>
            </section>

            <section>
              <h2 className="font-heading text-xl text-primary mb-3">4. HOW TO REQUEST A REFUND</h2>
              <p className="text-muted-foreground leading-relaxed mb-2">
                To request a refund, please email us at{" "}
                <a href="mailto:streeteatzwaterford@gmail.com" className="text-primary hover:underline">
                  streeteatzwaterford@gmail.com
                </a>{" "}
                within <strong className="text-foreground">24 hours</strong> of collection or delivery and include:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Your order number</li>
                <li>A short description of the issue</li>
                <li>A photograph of the item where applicable</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-3">
                Requests received after 24 hours may not be eligible for a refund.
              </p>
            </section>

            <section>
              <h2 className="font-heading text-xl text-primary mb-3">5. PROCESSING TIME</h2>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Approved refunds are returned to your original payment method within <strong className="text-foreground">5&ndash;10 business days</strong>.</li>
                <li>Cash refunds may, where appropriate, be provided as store credit redeemable in person.</li>
                <li>Your bank or card issuer may take additional time to display the refund on your statement.</li>
              </ul>
            </section>

            <section>
              <h2 className="font-heading text-xl text-primary mb-3">6. STATUTORY RIGHTS</h2>
              <p className="text-muted-foreground leading-relaxed">
                Your statutory rights as a consumer under Irish and EU consumer protection law are not affected by
                this policy. Note that under the Consumer Rights Act, the standard 14-day cooling-off right does not
                apply to perishable goods such as freshly prepared food.
              </p>
            </section>

            <section>
              <h2 className="font-heading text-xl text-primary mb-3">7. CONTACT</h2>
              <div className="mt-3 p-4 bg-card/50 border border-border rounded-lg">
                <p className="text-foreground font-semibold">Street Eatz Waterford</p>
                <p className="text-muted-foreground">Crystal Sports and Leisure Centre</p>
                <p className="text-muted-foreground">Cork Rd, Ballynaneashagh</p>
                <p className="text-muted-foreground">Waterford, X91 E6PX, Ireland</p>
                <p className="text-primary mt-2">streeteatzwaterford@gmail.com</p>
              </div>
            </section>
          </div>
        </div>
      </main>

      <SiteFooter />
      <FooterInfoBar />
    </div>
  );
};

export default RefundPolicy;