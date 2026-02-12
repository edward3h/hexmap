FROM php:8.2-apache

# Enable pdo_mysql extension
RUN docker-php-ext-install pdo_mysql

# Enable Apache mod_rewrite
RUN a2enmod rewrite

# Allow .htaccess overrides in the document root
RUN sed -i '/<Directory \/var\/www\/html>/,/<\/Directory>/s/AllowOverride None/AllowOverride All/' /etc/apache2/apache2.conf

EXPOSE 80
