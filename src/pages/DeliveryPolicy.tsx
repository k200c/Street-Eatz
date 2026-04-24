import { Navbar } from "@/components/layout/Navbar";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { FooterInfoBar } from "@/components/layout/FooterInfoBar";

const DeliveryPolicy = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 pt-20 pb-24 px-4">
        <div className="max-w-3xl mx-auto">
          <h1 className="font-heading text-3xl md:text-4xl text-foreground mb-6">
            DELIVERY POLICY
          </h1>

          <p className="text-muted-foreground text-sm mb-8">
            Last updated: {new Date().toLocaleDateString('en-IE', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>

          <div className="space-y-8 text-foreground">
            <section>
              <h2 className="font-heading text-xl text-primary mb-3">1. COLLECTION</h2>
              <p className="text-muted-foreground leading-relaxed mb-2">
                Collection is our primary fulfilment method. Orders placed through our website are prepared
                for in-person pickup at:
              </p>
              <div className="p-4 bg-card/50 border border-border rounded-lg text-muted-foreground">
                <p className="text-foreground font-semibold">Street Eatz Waterford</p>
                <p>Crystal Sports and Leisure Centre, Cork Rd</p>
                <p>Waterford, X91 E6PX, Ireland</p>
              </div>
              <p className="text-muted-foreground leading-relaxed mt-3">
                Collection is available during our normal opening hours: Thursday &ndash; Friday 12pm&ndash;7pm
                and Saturday &ndash; Sunday 1pm&ndash;7pm.
              </p>
            </section>

            <section>
              <h2 className="font-heading text-xl text-primary mb-3">2. THIRD-PARTY DELIVERY</h2>
              <p className="text-muted-foreground leading-relaxed mb-2">
                We do not operate our own delivery service. Delivery is offered through independent third-party
                platforms including <strong className="text-foreground">Deliveroo</strong> and{" "}
                <strong className="text-foreground">Just Eat</strong>.
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Orders placed via these platforms are fulfilled by their own couriers.</li>
                <li>The delivery itself is governed by the platform's own terms and conditions.</li>
                <li>
                  Once an order has been collected by a third-party courier, Street Eatz Waterford is{" "}
                  <strong className="text-foreground">not liable</strong> for any delay, damage in transit,
                  loss, or non-delivery.
                </li>
                <li>
                  Issues with the delivery itself (late arrival, courier behaviour, missing delivery) should be
                  raised directly with Deliveroo or Just Eat customer support.
                </li>
                <li>
                  Issues with the food itself (incorrect, missing or faulty items) should be reported to us in
                  line with our{" "}
                  <a href="/refund-policy" className="text-primary hover:underline">Refund Policy</a>.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="font-heading text-xl text-primary mb-3">3. ESTIMATED TIMES</h2>
              <p className="text-muted-foreground leading-relaxed">
                Collection orders are typically ready in <strong className="text-foreground">10&ndash;20 minutes</strong>{" "}
                from confirmation, depending on order volume. During peak periods this may take longer.
                Delivery times via third-party platforms are set and managed by the platform.
              </p>
            </section>

            <section>
              <h2 className="font-heading text-xl text-primary mb-3">4. CUSTOMER RESPONSIBILITY AFTER PICKUP / DELIVERY</h2>
              <p className="text-muted-foreground leading-relaxed">
                Once an order has been handed to you (collection) or to a third-party courier (delivery),
                responsibility for the food passes from Street Eatz Waterford. Please consume your food promptly
                for the best quality and food-safety experience. We cannot be held responsible for issues caused by
                food being left uneaten for extended periods after collection or delivery.
              </p>
            </section>

            <section>
              <h2 className="font-heading text-xl text-primary mb-3">5. FAILED COLLECTIONS</h2>
              <p className="text-muted-foreground leading-relaxed">
                Orders that are not collected within <strong className="text-foreground">30 minutes</strong> of being
                marked ready may not be remade or refunded. For food-safety reasons, prepared food cannot be held
                indefinitely. If you know you will be late, please contact us as soon as possible by email.
              </p>
            </section>

            <section>
              <h2 className="font-heading text-xl text-primary mb-3">6. CONTACT</h2>
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

export default DeliveryPolicy;