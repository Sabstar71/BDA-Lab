FROM nginx:alpine
WORKDIR /usr/share/nginx/html
COPY main.html ./index.html
COPY appi.js ./appi.js
COPY style.css ./style.css
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
