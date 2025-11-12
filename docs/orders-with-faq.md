# Orders with FAQ

```groq
*[_type == "order" && defined(faq) && count(faq) > 0]{
  _id,
  orderNumber,
  status,
  faq[]{
    question,
    answer
  }
}
```
