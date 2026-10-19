---
diagram_name: retail-checkout
flow_name: Retail Checkout
author: Demo
language: en
---
Customer calls Storefront. Storefront calls Orders. Orders synchronously calls Payments and Inventory. Orders asynchronously publishes an event to Notifications.
